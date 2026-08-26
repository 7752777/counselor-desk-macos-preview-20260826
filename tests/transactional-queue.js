const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const match = html.match(/const transactionalMutationQueues = new Map\(\);[\s\S]*?\nfunction snapshotDataMutation/);
assert.ok(match, 'shared transactional mutation queue should remain available');
const api = new Function(`${match[0].replace(/\nfunction snapshotDataMutation$/, '')}\nreturn { queueTransactionalMutation };`)();

(async () => {
  const events = [];
  const first = api.queueTransactionalMutation('students', async () => {
    events.push('first:start');
    await new Promise(resolve => setTimeout(resolve, 5));
    events.push('first:end');
    return 'first';
  });
  const second = api.queueTransactionalMutation('students', async () => {
    events.push('second:start');
    events.push('second:end');
    return 'second';
  });
  const other = api.queueTransactionalMutation('custom', async () => {
    events.push('other');
    return 'other';
  });
  assert.deepEqual(await Promise.all([first, second, other]), ['first', 'second', 'other']);
  assert.deepEqual(events, ['first:start', 'other', 'first:end', 'second:start', 'second:end'], 'different collections may progress independently while the same collection remains ordered');
  console.log('PASS transactional-queue');
})().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
