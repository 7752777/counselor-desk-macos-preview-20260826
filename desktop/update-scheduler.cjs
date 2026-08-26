'use strict';

const DEFAULT_INITIAL_DELAY_MS = 30 * 1000;
const DEFAULT_INTERVAL_MS = 6 * 60 * 60 * 1000;

function createUpdateScheduler(options) {
  const opts = options || {};
  const enabled = opts.enabled !== false && typeof opts.check === 'function';
  const setTimeoutFn = opts.setTimeout || setTimeout;
  const setIntervalFn = opts.setInterval || setInterval;
  const clearTimeoutFn = opts.clearTimeout || clearTimeout;
  const clearIntervalFn = opts.clearInterval || clearInterval;
  const initialDelayMs = Math.max(0, Number(opts.initialDelayMs || DEFAULT_INITIAL_DELAY_MS));
  const intervalMs = Math.max(1000, Number(opts.intervalMs || DEFAULT_INTERVAL_MS));
  let initialTimer = null;
  let intervalTimer = null;
  let running = false;
  let started = false;
  let stopped = false;
  let lastError = '';
  let lastRunAt = '';

  function detach(timer, clear) {
    if (timer == null) return;
    try { clear(timer); } catch (_) {}
  }

  async function run() {
    if (!enabled || stopped || running) return null;
    running = true;
    lastRunAt = new Date().toISOString();
    try {
      const result = await opts.check();
      lastError = '';
      return result;
    } catch (error) {
      lastError = String(error && (error.code || error.message) || 'UPDATE_CHECK_FAILED');
      if (typeof opts.onError === 'function') {
        try { opts.onError(error); } catch (_) {}
      }
      return null;
    } finally {
      running = false;
    }
  }

  function start() {
    if (!enabled || started) return false;
    started = true;
    stopped = false;
    initialTimer = setTimeoutFn(() => { initialTimer = null; run(); }, initialDelayMs);
    intervalTimer = setIntervalFn(() => { run(); }, intervalMs);
    if (initialTimer && typeof initialTimer.unref === 'function') initialTimer.unref();
    if (intervalTimer && typeof intervalTimer.unref === 'function') intervalTimer.unref();
    return true;
  }

  function stop() {
    stopped = true;
    started = false;
    detach(initialTimer, clearTimeoutFn);
    detach(intervalTimer, clearIntervalFn);
    initialTimer = null;
    intervalTimer = null;
    return true;
  }

  return Object.freeze({
    start,
    stop,
    run,
    status:() => ({ enabled, started, stopped, running, lastError, lastRunAt }),
  });
}

module.exports = { createUpdateScheduler, DEFAULT_INITIAL_DELAY_MS, DEFAULT_INTERVAL_MS };
