'use strict';

const http = require('node:http');
const { handleAiRelayRequest, createManagedQuotaLimiter, isLoopbackHost, RELAY_PATH } = require('./ai-relay');

const host = process.env.AI_RELAY_HOST || '127.0.0.1';
const port = Number(process.env.AI_RELAY_PORT || 8787);
const requireRelayToken = !isLoopbackHost(host);
const licensePublicKeys = (() => { try { const value = JSON.parse(process.env.CWB_LICENSE_PUBLIC_KEYS_JSON || '{}'); return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; } catch (_) { return {}; } })();
const consumeManagedQuota = createManagedQuotaLimiter({ dailyLimit:Number(process.env.CWB_AI_MANAGED_DAILY_QUOTA || 30) });

const server = http.createServer(async (request, response) => {
  if (await handleAiRelayRequest(request, response, { requireToken:requireRelayToken, requireLicense:process.env.AI_RELAY_REQUIRE_LICENSE === '1', licensePublicKeys, consumeManagedQuota })) return;
  response.writeHead(404, { 'content-type':'application/json; charset=utf-8' });
  response.end(JSON.stringify({ error:{ code:'AI_RELAY_NOT_FOUND' } }));
});

server.on('error', error => {
  if (error.code === 'EADDRINUSE') console.error(`AI relay port ${port} is already in use. Set AI_RELAY_PORT to use another port.`);
  else console.error(error);
  process.exitCode = 1;
});

server.listen(port, host, () => {
  console.log(`AI relay: http://${host}:${port}${RELAY_PATH}`);
  console.log('The relay never logs API keys or request bodies.');
});
