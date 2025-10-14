import { generateLegalMoves, pieceAt } from '../chess/rules.js';

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

export function createBoardUI(rootEl, game, { onUserMove } = {}) {
  let perspective = 'w';
  let playerSide = null;
  let selected = null;
  const legalTargets = new Set();
  let lastMove = null;

  function setPerspective(side) {
    perspective = side;
  }

  function setPlayerSide(side) {
    playerSide = side;
  }

  function coordsForIndex(i) {
    return { r: Math.floor(i / 8), c: i % 8 };
  }

  function indexForCoords(r, c) {
    return r * 8 + c;
  }

  function render(currentGame) {
    const state = currentGame.state;
    rootEl.innerHTML = '';
    lastMove = state.lastMove || null;
    const order = [];
    for (let r = 0; r < 8; r += 1) {
      for (let c = 0; c < 8; c += 1) order.push({ r, c });
    }
    if (perspective === 'b') order.reverse();
    for (const { r, c } of order) {
      const sq = document.createElement('div');
      const isLight = (r + c) % 2 === 0;
      sq.className = `square ${isLight ? 'light' : 'dark'}`;
      sq.setAttribute('role', 'gridcell');
      sq.dataset.r = r;
      sq.dataset.c = c;
      const p = pieceAt(state.board, r, c);
      if (p) {
        const span = document.createElement('span');
        span.className = 'piece';
        span.textContent = UNICODE[p] || p;
        sq.appendChild(span);
      }
      if (selected && selected.r === r && selected.c === c) sq.classList.add('highlight');
      if (
        lastMove &&
        ((lastMove.from.r === r && lastMove.from.c === c) ||
          (lastMove.to.r === r && lastMove.to.c === c))
      ) {
        sq.classList.add('last-move');
      }
      if (legalTargets.has(`${r},${c}`)) sq.classList.add('legal');
      sq.addEventListener('click', onSquareClick);
      rootEl.appendChild(sq);
    }
  }

  function selectSquare(r, c, piece) {
    if (!piece) return false;
    const isWhite = piece === piece.toUpperCase();
    const color = isWhite ? 'w' : 'b';
    const isTurn = game.state.turn === color;
    const isPlayerPiece = playerSide ? playerSide === color : false;

    if (!isTurn && !isPlayerPiece) return false;
    selected = { r, c };
    legalTargets.clear();
    if (isTurn) {
      const moves = generateLegalMoves(game.state);
      for (const m of moves) {
        if (m.from.r === r && m.from.c === c) legalTargets.add(`${m.to.r},${m.to.c}`);
      }
    }
    render(game);
    return true;
  }

  function onSquareClick(e) {
    const r = parseInt(e.currentTarget.dataset.r, 10);
    const c = parseInt(e.currentTarget.dataset.c, 10);
    const p = pieceAt(game.state.board, r, c);

    if (!selected) {
      selectSquare(r, c, p);
      return;
    }

    if (selected.r === r && selected.c === c) {
      selected = null;
      legalTargets.clear();
      render(game);
      return;
    }

    const key = `${r},${c}`;
    if (legalTargets.has(key)) {
      const moves = generateLegalMoves(game.state);
      const match = moves.find(
        (m) =>
          m.from.r === selected.r &&
          m.from.c === selected.c &&
          m.to.r === r &&
          m.to.c === c &&
          (!m.promotion || m.promotion === 'Q'),
      );
      if (match) {
        onUserMove?.(match);
        selected = null;
        legalTargets.clear();
        return;
      }
    }

    if (!selectSquare(r, c, p)) {
      selected = null;
      legalTargets.clear();
      render(game);
    }
  }

  return { render, setPerspective, setPlayerSide };
}

