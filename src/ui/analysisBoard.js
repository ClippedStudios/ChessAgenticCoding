import { cloneState, makeMove } from '../chess/rules.js';

const UNICODE = {
  K: '\u2654',
  Q: '\u2655',
  R: '\u2656',
  B: '\u2657',
  N: '\u2658',
  P: '\u2659',
  k: '\u265A',
  q: '\u265B',
  r: '\u265C',
  b: '\u265D',
  n: '\u265E',
  p: '\u265F',
};

function cloneBoard(board) {
  return board.map((row) => row.slice());
}

function renderMatrix(rootEl, matrix) {
  rootEl.innerHTML = '';
  for (let r = 0; r < 8; r += 1) {
    for (let c = 0; c < 8; c += 1) {
      const square = document.createElement('div');
      const isLight = (r + c) % 2 === 0;
      square.className = `square ${isLight ? 'light' : 'dark'}`;
      const piece = matrix[r][c];
      if (piece) {
        const span = document.createElement('span');
        span.className = 'piece';
        span.textContent = UNICODE[piece] || piece;
        square.appendChild(span);
      }
      rootEl.appendChild(square);
    }
  }
}

export function createAnalysisDisplay(rootEl, infoEl, { frameDelay = 550, holdMs = 450 } = {}) {
  let frames = [];
  let currentIndex = 0;
  let timer = null;
  let queue = [];
  let activeMeta = null;
  let advancing = false;

  function stopAnimation() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  function setInfo(text) {
    if (infoEl) infoEl.textContent = text;
  }

  function showFrames() {
    if (frames.length === 0) return;
    const matrix = frames[currentIndex];
    renderMatrix(rootEl, matrix);
  }

  function finishSequence() {
    stopAnimation();
    advancing = false;
    if (queue.length > 0) {
      const next = queue.shift();
      loadSequence(next);
    }
  }

  function playOnce() {
    stopAnimation();
    if (frames.length <= 1) {
      showFrames();
      setTimeout(finishSequence, holdMs);
      return;
    }
    timer = setInterval(() => {
      currentIndex += 1;
      if (currentIndex >= frames.length) {
        stopAnimation();
        setTimeout(finishSequence, holdMs);
        return;
      }
      showFrames();
    }, frameDelay);
  }

  function loadSequence(entry) {
    const { baseState, line, meta = {} } = entry;
    stopAnimation();
    advancing = true;
    const baseClone = cloneState(baseState);
    const lineState = cloneState(baseState);
    const sequence = [cloneBoard(baseClone.board)];
    for (const move of line) {
      makeMove(lineState, move, { skipResult: true });
      sequence.push(cloneBoard(lineState.board));
    }
    frames = sequence;
    currentIndex = 0;
    activeMeta = meta;
    if (meta.infoText) setInfo(meta.infoText);
    showFrames();
    playOnce();
  }

  function queueLine(baseState, line, meta = {}) {
    queue.push({ baseState, line, meta });
    if (!advancing) {
      loadSequence(queue.shift());
    }
  }

  function showLine(baseState, line, meta = {}) {
    queue = [];
    stopAnimation();
    const baseClone = cloneState(baseState);
    const sequence = [cloneBoard(baseClone.board)];
    const lineState = cloneState(baseState);
    for (const move of line) {
      makeMove(lineState, move, { skipResult: true });
      sequence.push(cloneBoard(lineState.board));
    }
    frames = sequence;
    currentIndex = 0;
    activeMeta = meta;
    if (meta.infoText) setInfo(meta.infoText);
    showFrames();
    playOnce();
  }

  function showPosition(state, meta = {}) {
    stopAnimation();
    queue = [];
    advancing = false;
    frames = [cloneBoard(state.board)];
    currentIndex = 0;
    if (meta.infoText) setInfo(meta.infoText);
    showFrames();
  }

  function clear(meta = {}) {
    stopAnimation();
    queue = [];
    advancing = false;
    frames = [];
    currentIndex = 0;
    rootEl.innerHTML = '';
    if (meta.infoText) setInfo(meta.infoText);
  }

  return {
    showLine,
    showPosition,
    setInfo,
    clear,
    queueLine,
    stop: stopAnimation,
  };
}
