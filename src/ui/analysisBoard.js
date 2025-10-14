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

const cloneBoard = (board) => board.map((row) => row.slice());

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

export function createAnalysisDisplay(rootEl, infoEl, { frameDelay = 320 } = {}) {
  let frames = [];
  let currentFrame = 0;
  let timer = null;

  const setInfo = (text) => {
    if (infoEl) infoEl.textContent = text;
  };

  const stop = () => {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  };

  const showCurrentFrame = () => {
    if (!frames.length) return;
    renderMatrix(rootEl, frames[currentFrame]);
  };

  const playSequence = (sequence, meta = {}) => {
    stop();
    frames = sequence;
    currentFrame = 0;
    if (meta.infoText) setInfo(meta.infoText);
    if (frames.length === 0) {
      rootEl.innerHTML = '';
      return;
    }
    showCurrentFrame();
    if (frames.length > 1) {
      timer = setInterval(() => {
        currentFrame += 1;
        if (currentFrame >= frames.length) {
          stop();
        } else {
          showCurrentFrame();
        }
      }, frameDelay);
    }
  };

  const showLine = (baseState, line, meta = {}) => {
    const playbackState = cloneState(baseState);
    const sequence = [cloneBoard(playbackState.board)];
    for (const move of line) {
      makeMove(playbackState, move, { skipResult: true });
      sequence.push(cloneBoard(playbackState.board));
    }
    playSequence(sequence, meta);
  };

  const showPosition = (state, meta = {}) => {
    playSequence(state ? [cloneBoard(state.board)] : [], meta);
  };

  const clear = (meta = {}) => {
    playSequence([], meta);
  };

  return {
    queueLine: showLine,
    showLine,
    showPosition,
    clear,
    setInfo,
    stop,
  };
}
