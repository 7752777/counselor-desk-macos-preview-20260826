/* Explicit staging runner for the isolated internal server.
 *
 * This entry point is intentionally separate from bootstrap.cjs. It refuses
 * production mode and is meant for loopback/SSH-tunnel testing only. A
 * production deployment must use bootstrap.cjs with TLS PostgreSQL, HTTPS,
 * an external signer and a real payment webhook adapter.
 */
const { createProductionApp } = require('./bootstrap.cjs');

if (String(process.env.CWB_LICENSE_ENV || '').trim().toLowerCase() !== 'staging') {
  throw new Error('LICENSE_STAGING_ENV_REQUIRED: set CWB_LICENSE_ENV=staging');
}

createProductionApp({ allowDevelopmentBootstrap:true }).then(async ({ app }) => {
  await app.listen({
    host:process.env.CWB_LICENSE_HOST || '127.0.0.1',
    port:Number(process.env.CWB_LICENSE_PORT || 8787),
  });
  console.log('Counselor Desk license staging service started');
}).catch(error => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
