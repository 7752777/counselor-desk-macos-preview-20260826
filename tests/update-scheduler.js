const assert = require('node:assert/strict');
const { createUpdateScheduler } = require('../desktop/update-scheduler.cjs');

(async () => {
  const timers = [];
  let checks = 0;
  let errors = 0;
  const scheduler = createUpdateScheduler({
    initialDelayMs:30,
    intervalMs:60000,
    check:async () => { checks += 1; return { ok:true }; },
    onError:() => { errors += 1; },
    setTimeout:(callback, delay) => { const timer = { callback, delay, kind:'timeout' }; timers.push(timer); return timer; },
    setInterval:(callback, delay) => { const timer = { callback, delay, kind:'interval' }; timers.push(timer); return timer; },
    clearTimeout:timer => { timer.cleared = true; },
    clearInterval:timer => { timer.cleared = true; },
  });
  assert.equal(scheduler.start(), true);
  assert.equal(scheduler.start(), false, 'the scheduler must not register duplicate timers');
  assert.deepEqual(timers.map(item => [item.kind, item.delay]), [['timeout', 30], ['interval', 60000]]);
  await scheduler.run();
  assert.equal(checks, 1);
  assert.equal(errors, 0);
  assert.equal(scheduler.status().lastError, '');
  assert.equal(scheduler.stop(), true);
  assert.equal(timers.every(item => item.cleared === true), true);

  let failingChecks = 0;
  const failing = createUpdateScheduler({
    setTimeout:callback => ({ callback }),
    setInterval:callback => ({ callback }),
    check:async () => { failingChecks += 1; throw Object.assign(new Error('offline'), { code:'UPDATE_MANIFEST_FETCH_FAILED' }); },
    onError:() => { errors += 1; },
  });
  await failing.run();
  assert.equal(failingChecks, 1);
  assert.equal(failing.status().lastError, 'UPDATE_MANIFEST_FETCH_FAILED');
  assert.equal(errors, 1);
  console.log('PASS update-scheduler');
})().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
