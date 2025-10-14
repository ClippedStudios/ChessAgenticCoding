export function createTimer({ onTick }) {
  let interval = null;
  let activeSide = 'w';
  function start(side) { activeSide = side; if (interval) clearInterval(interval); interval = setInterval(() => onTick(), 100); }
  function switchTurn(side) { activeSide = side; }
  function pause() { if (interval) { clearInterval(interval); interval = null; } }
  function resume() { if (!interval) interval = setInterval(() => onTick(), 100); }
  function stop() { if (interval) { clearInterval(interval); interval = null; } }
  return { start, switchTurn, pause, resume, stop };
}

