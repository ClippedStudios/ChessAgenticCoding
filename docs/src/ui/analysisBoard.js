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

export function createAnalysisDisplay(rootEl, infoEl, { frameDelay = 550 } = {}) {
  let frames = [];
  let currentIndex = 0;
  let timer = null;

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

  function play() {
    stopAnimation();
    if (frames.length <= 1) {
      showFrames();
      return;
    }
    timer = setInterval(() => {
      currentIndex = (currentIndex + 1) % frames.length;
      showFrames();
    }, frameDelay);
  }

  function showLine(baseState, line, meta = {}) {
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
    if (meta.infoText) setInfo(meta.infoText);
    showFrames();
    play();
  }

  function showPosition(state, meta = {}) {
    stopAnimation();
    frames = [cloneBoard(state.board)];
    currentIndex = 0;
    if (meta.infoText) setInfo(meta.infoText);
    showFrames();
  }

  function clear(meta = {}) {
    stopAnimation();
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
    stop: stopAnimation,
  };
}

