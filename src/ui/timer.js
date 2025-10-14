export function createTimer({ onTick }) {
  let interval = null;
  let activeSide = 'w';
  let lastStamp = null;

  function tick() {
    const now = performance.now();
    if (lastStamp == null) {
      lastStamp = now;
      return;
    }
    const delta = now - lastStamp;
    lastStamp = now;
    onTick(activeSide, delta);
  }

  function start(side) {
    activeSide = side;
    lastStamp = performance.now();
    if (interval) clearInterval(interval);
    interval = setInterval(tick, 100);
  }

  function flush() {
    if (lastStamp == null) return;
    const now = performance.now();
    const delta = now - lastStamp;
    lastStamp = now;
    if (delta > 0) onTick(activeSide, delta);
  }

  function switchTurn(side) {
    flush();
    activeSide = side;
    lastStamp = performance.now();
  }

  function pause() {
    if (interval) {
      flush();
      clearInterval(interval);
      interval = null;
    }
  }

  function resume() {
    if (!interval) {
      lastStamp = performance.now();
      interval = setInterval(tick, 100);
    }
  }

  function stop() {
    if (interval) {
      clearInterval(interval);
      interval = null;
    }
    lastStamp = null;
  }

  return { start, switchTurn, pause, resume, stop };
}
