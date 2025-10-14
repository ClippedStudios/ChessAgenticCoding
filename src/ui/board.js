import { generateLegalMoves, pieceAt, toSAN } from '../chess/rules.js';

const UNICODE = {
  'K': '♔','Q':'♕','R':'♖','B':'♗','N':'♘','P':'♙',
  'k': '♚','q':'♛','r':'♜','b':'♝','n':'♞','p':'♟',
};

export function createBoardUI(rootEl, game, { onUserMove }) {
  let perspective = 'w';
  let selected = null;
  let legalTargets = new Set();
  let lastMove = null;

  function setPerspective(side) { perspective = side; }

  function coordsForIndex(i) { return { r: Math.floor(i / 8), c: i % 8 }; }
  function indexForCoords(r,c) { return r*8+c; }

  function render(game) {
    rootEl.innerHTML = '';
    lastMove = game.state.lastMove || null;
    const order = [];
    for (let r=0;r<8;r++) for (let c=0;c<8;c++) order.push({r,c});
    if (perspective === 'b') order.reverse();
    for (const {r,c} of order) {
      const i = indexForCoords(r,c);
      const sq = document.createElement('div');
      const isLight = (r + c) % 2 === 0;
      sq.className = `square ${isLight ? 'light' : 'dark'}`;
      sq.setAttribute('role', 'gridcell');
      sq.dataset.r = r; sq.dataset.c = c;
      const p = pieceAt(game.state.board, r, c);
      if (p) {
        const span = document.createElement('span');
        span.className = 'piece';
        span.textContent = UNICODE[p] || p;
        sq.appendChild(span);
      }
      if (selected && selected.r === r && selected.c === c) sq.classList.add('highlight');
      if (lastMove && ((lastMove.from.r===r&&lastMove.from.c===c) || (lastMove.to.r===r&&lastMove.to.c===c))) sq.classList.add('last-move');
      const key = `${r},${c}`;
      if (legalTargets.has(key)) sq.classList.add('legal');
      sq.addEventListener('click', onSquareClick);
      rootEl.appendChild(sq);
    }
  }

  function onSquareClick(e) {
    const r = parseInt(e.currentTarget.dataset.r, 10);
    const c = parseInt(e.currentTarget.dataset.c, 10);
    const p = pieceAt(game.state.board, r, c);
    if (!selected) {
      // Select only if piece belongs to side to move
      if (!p) return;
      const isWhite = p === p.toUpperCase();
      if ((game.state.turn === 'w' && !isWhite) || (game.state.turn === 'b' && isWhite)) return;
      selected = { r, c };
      populateLegalTargets();
      render(game);
      return;
    } else {
      if (selected.r === r && selected.c === c) {
        selected = null; legalTargets.clear(); render(game); return;
      }
      const key = `${r},${c}`;
      if (legalTargets.has(key)) {
        const moves = generateLegalMoves(game.state);
        const match = moves.find(m => m.from.r===selected.r && m.from.c===selected.c && m.to.r===r && m.to.c===c && (!m.promotion || m.promotion==='Q'));
        // For now, auto-queen promotions; could add UI later
        if (match) {
          onUserMove(match);
          selected = null; legalTargets.clear();
          return;
        }
      }
      // Reselect if clicking own piece
      const own = p && ((game.state.turn === 'w' && p === p.toUpperCase()) || (game.state.turn === 'b' && p === p.toLowerCase()));
      if (own) { selected = { r, c }; populateLegalTargets(); render(game); return; }
      selected = null; legalTargets.clear(); render(game);
    }
  }

  function populateLegalTargets() {
    legalTargets.clear();
    if (!selected) return;
    const moves = generateLegalMoves(game.state);
    for (const m of moves) if (m.from.r===selected.r && m.from.c===selected.c) legalTargets.add(`${m.to.r},${m.to.c}`);
  }

  return { render, setPerspective };
}

