export function createDebouncedTask({ delayMs, run, setTimeoutFn = setTimeout, clearTimeoutFn = clearTimeout }) {
  let timer = null;
  let queuedValue;
  let hasQueuedValue = false;
  let lastRunValue;
  let hasLastRunValue = false;

  const clearTimer = () => {
    if (timer !== null) clearTimeoutFn(timer);
    timer = null;
  };
  const flush = () => {
    clearTimer();
    if (!hasQueuedValue) return false;
    const value = queuedValue;
    hasQueuedValue = false;
    if (hasLastRunValue && value === lastRunValue) return false;
    run(value);
    lastRunValue = value;
    hasLastRunValue = true;
    return true;
  };

  return {
    schedule(value) { queuedValue = value; hasQueuedValue = true; clearTimer(); timer = setTimeoutFn(flush, delayMs); },
    flush,
    markPersisted(value) { clearTimer(); hasQueuedValue = false; lastRunValue = value; hasLastRunValue = true; },
    pending: () => hasQueuedValue,
  };
}
