/* Export signed, one-time sale inventory for a digital-goods platform.
 *
 * The platform receives only the signed customer license token. It never
 * receives the Ed25519 signing key, database credentials, or student data.
 * Keep the output file in an encrypted, access-controlled location and delete
 * or mark an item as unavailable when it has been sold or refunded.
 */
const fs = require('node:fs/promises');
const path = require('node:path');

function value(name, fallback, environment) {
  const result = String((environment || process.env)[name] || fallback || '').trim();
  if (!result) throw new Error(`${name} is required`);
  return result;
}

function arg(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function usage() {
  return 'Usage: CWB_LICENSE_ADMIN_KEY=... node scripts/export-license-stock.cjs --url http://127.0.0.1:8787 --plan standard --count 10 --batch-email inventory@example.com --output stock.txt';
}

function config(environment, argv) {
  const oldArgv = process.argv;
  if (Array.isArray(argv)) process.argv = argv;
  try {
    const env = environment || process.env;
    const baseUrl = value('CWB_LICENSE_SERVICE_URL', arg('--url'), env).replace(/\/$/, '');
    const adminKey = value('CWB_LICENSE_ADMIN_KEY', '', env);
    const plan = value('CWB_LICENSE_PLAN', arg('--plan'), env);
    const count = Number(value('CWB_LICENSE_COUNT', arg('--count'), env));
    const batchEmail = value('CWB_LICENSE_BATCH_EMAIL', arg('--batch-email'), env).toLowerCase();
    const output = value('CWB_LICENSE_OUTPUT', arg('--output'), env);
    if (!Number.isInteger(count) || count < 1 || count > 500) throw new Error('count must be an integer from 1 to 500');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(batchEmail)) throw new Error('batch-email must be a valid operations email address');
    return { baseUrl, adminKey, plan, count, batchEmail, output };
  } finally {
    if (Array.isArray(argv)) process.argv = oldArgv;
  }
}

function batchRequest(input) {
  const idempotencyKey = `stock_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  return {
    plan:input.plan,
    count:input.count,
    customer_email:input.batchEmail,
    idempotency_key:idempotencyKey,
    metadata:{ source:'digital-goods-stock-export', stock_batch_email:input.batchEmail },
  };
}

async function main(environment, argv) {
  const input = config(environment || process.env, argv);
  const { baseUrl, adminKey, count, output } = input;
  const request = batchRequest(input);
  const response = await fetch(`${baseUrl}/api/v1/admin/license-batches`, {
    method:'POST',
    headers:{ 'Content-Type':'application/json', 'X-Admin-Api-Key':adminKey },
    body:JSON.stringify(request),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !Array.isArray(body.licenses)) throw new Error(`${body.code || `HTTP_${response.status}`}: stock generation failed`);
  const lines = body.licenses.map(item => String(item.token || '').trim()).filter(Boolean);
  if (lines.length !== count) throw new Error('server returned an unexpected license count');
  const target = path.resolve(output);
  await fs.mkdir(path.dirname(target), { recursive:true });
  await fs.writeFile(target, `${lines.join('\n')}\n`, { encoding:'utf8', mode:0o600, flag:'wx' });
  process.stdout.write(`Generated ${lines.length} ${input.plan} license cards at ${target}\n`);
}

if (require.main === module) main().catch(error => { console.error(`${error.message || error}\n${usage()}`); process.exitCode = 1; });

module.exports = { config, batchRequest, main };
