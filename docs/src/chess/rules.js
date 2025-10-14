export const START_FEN = 'rnbrqkbn/pppppppp/8/8/8/8/PPPPPPPP/RNBRQKBN w KQkq - 0 1';
// Note: Intentional simple FEN close to standard; RNBQKBNR rook/knight mismatch was a typo. We'll use proper initial below.
// Proper start position:
export const STANDARD_START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

function emptyBoard() { return Array.from({ length: 8 }, () => Array(8).fill('')); }

export function parseFEN(fen) {
  if (!fen) fen = STANDARD_START_FEN;
  const [piece, turn, castling, ep, halfmove, fullmove] = fen.split(' ');
  const board = emptyBoard();
  const rows = piece.split('/');
  for (let r = 0; r < 8; r++) {
    let c = 0;
    for (const ch of rows[r]) {
      if (/[1-8]/.test(ch)) c += parseInt(ch, 10); else { board[r][c++] = ch; }
    }
  }
  const state = {
    board,
    turn: turn || 'w',
    castling: { K: castling?.includes('K'), Q: castling?.includes('Q'), k: castling?.includes('k'), q: castling?.includes('q') },
    ep: ep && ep !== '-' ? algebraToRC(ep) : null,
    halfmove: parseInt(halfmove||'0',10),
    fullmove: parseInt(fullmove||'1',10),
  };
  return state;
}

export function cloneState(state) {
  return JSON.parse(JSON.stringify(state));
}

export function pieceAt(board, r, c) { if (r<0||r>7||c<0||c>7) return null; return board[r][c]; }
function setPiece(board, r, c, p) { board[r][c] = p; }
function isWhite(p) { return p && p === p.toUpperCase(); }
function isBlack(p) { return p && p === p.toLowerCase(); }
function algebraToRC(str) { const file = str.charCodeAt(0) - 97; const rank = 8 - parseInt(str[1],10); return { r: rank, c: file }; }
function rcToAlgebra({r,c}) { return String.fromCharCode(97 + c) + (8 - r); }

const DIRS = {
  N: [ [-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1] ],
  B: [ [-1,-1],[-1,1],[1,-1],[1,1] ],
  R: [ [-1,0],[1,0],[0,-1],[0,1] ],
};

export function inCheck(state, side) {
  const { r: kr, c: kc } = findKing(state.board, side);
  return squareAttacked(state, { r: kr, c: kc }, side === 'w' ? 'b' : 'w');
}

function findKing(board, side) {
  const target = side === 'w' ? 'K' : 'k';
  for (let r=0;r<8;r++) for (let c=0;c<8;c++) if (board[r][c] === target) return { r, c };
  return { r:-1, c:-1 };
}

function squareAttacked(state, sq, bySide) {
  const { board } = state; const { r, c } = sq;
  // Pawns
  const dir = bySide === 'w' ? -1 : 1;
  for (const dc of [-1,1]) { const rr = r + dir, cc = c + dc; const p = pieceAt(board, rr, cc); if (p && (bySide==='w'?p==='P':p==='p')) return true; }
  // Knights
  for (const [dr,dc] of DIRS.N) { const p = pieceAt(board, r+dr, c+dc); if (p && ((bySide==='w'&&p==='N')||(bySide==='b'&&p==='n'))) return true; }
  // Bishops/Queens
  for (const [dr,dc] of DIRS.B) { let rr=r+dr, cc=c+dc; while (rr>=0&&rr<8&&cc>=0&&cc<8){ const p=pieceAt(board,rr,cc); if (p){ if ((bySide==='w'&&(p==='B'||p==='Q'))||(bySide==='b'&&(p==='b'||p==='q'))) return true; break;} rr+=dr; cc+=dc; } }
  // Rooks/Queens
  for (const [dr,dc] of DIRS.R) { let rr=r+dr, cc=c+dc; while (rr>=0&&rr<8&&cc>=0&&cc<8){ const p=pieceAt(board,rr,cc); if (p){ if ((bySide==='w'&&(p==='R'||p==='Q'))||(bySide==='b'&&(p==='r'||p==='q'))) return true; break;} rr+=dr; cc+=dc; } }
  // King
  for (let dr=-1; dr<=1; dr++) for (let dc=-1; dc<=1; dc++) if (dr||dc){ const p=pieceAt(board,r+dr,c+dc); if (p && ((bySide==='w'&&p==='K')||(bySide==='b'&&p==='k'))) return true; }
  return false;
}

export function generateLegalMoves(state) {
  const moves = generatePseudoLegal(state);
  const legal = [];
  for (const m of moves) {
    const s2 = cloneState(state);
    makeMove(s2, m, { skipResult: true });
    if (!inCheck(s2, state.turn)) legal.push(m);
  }
  // Add SAN strings lazily in toSAN
  return legal;
}

function generatePseudoLegal(state) {
  const { board, turn } = state; const out = [];
  for (let r=0;r<8;r++) for (let c=0;c<8;c++) {
    const p = board[r][c]; if (!p) continue;
    const white = p===p.toUpperCase(); if ((turn==='w' && !white) || (turn==='b' && white)) continue;
    const side = white?'w':'b';
    switch (p.toUpperCase()) {
      case 'P': genPawn(state, r, c, side, out); break;
      case 'N': genKnight(state, r, c, side, out); break;
      case 'B': genSlide(state, r, c, side, DIRS.B, out); break;
      case 'R': genSlide(state, r, c, side, DIRS.R, out); break;
      case 'Q': genSlide(state, r, c, side, [...DIRS.B, ...DIRS.R], out); break;
      case 'K': genKing(state, r, c, side, out); break;
    }
  }
  return out;
}

function pushMove(out, from, to, extra={}) { out.push({ from, to, ...extra }); }

function genPawn(state, r, c, side, out) {
  const { board } = state; const dir = side==='w'?-1:1; const startRank = side==='w'?6:1; const promoRank = side==='w'?0:7;
  // forward
  if (!pieceAt(board, r+dir, c)) {
    if (r+dir === promoRank) ['Q','R','B','N'].forEach(pr => pushMove(out, {r,c}, {r:r+dir,c}, { promotion: pr }));
    else pushMove(out, {r,c}, {r:r+dir,c});
    if (r===startRank && !pieceAt(board, r+2*dir, c)) pushMove(out, {r,c}, {r:r+2*dir,c}, { doublePawn: true });
  }
  // captures
  for (const dc of [-1,1]) {
    const rr = r+dir, cc = c+dc; const t = pieceAt(board, rr, cc);
    if (t && ((side==='w'&&isBlack(t))||(side==='b'&&isWhite(t)))) {
      if (rr === promoRank) ['Q','R','B','N'].forEach(pr => pushMove(out, {r,c}, {r:rr,c:cc}, { capture: t, promotion: pr }));
      else pushMove(out, {r,c}, {r:rr,c:cc}, { capture: t });
    }
  }
  // en passant
  if (state.ep) {
    const { r: er, c: ec } = state.ep;
    if (er === r+dir && Math.abs(ec - c) === 1) pushMove(out, {r,c}, {r:er,c:ec}, { enPassant: true });
  }
}

function genKnight(state, r, c, side, out) {
  for (const [dr,dc] of DIRS.N) {
    const rr=r+dr, cc=c+dc; const t=pieceAt(state.board, rr, cc);
    if (rr<0||rr>7||cc<0||cc>7) continue;
    if (!t || (side==='w'?isBlack(t):isWhite(t))) pushMove(out, {r,c}, {r:rr,c:cc}, t?{capture:t}:{})
  }
}

function genSlide(state, r, c, side, dirs, out) {
  for (const [dr,dc] of dirs) {
    let rr=r+dr, cc=c+dc; while (rr>=0&&rr<8&&cc>=0&&cc<8){ const t=pieceAt(state.board, rr, cc); if (!t){ pushMove(out,{r,c},{r:rr,c:cc}); } else { if (side==='w'?isBlack(t):isWhite(t)) pushMove(out,{r,c},{r:rr,c:cc},{capture:t}); break;} rr+=dr; cc+=dc; }
  }
}

function genKing(state, r, c, side, out) {
  for (let dr=-1; dr<=1; dr++) for (let dc=-1; dc<=1; dc++) if (dr||dc) {
    const rr=r+dr, cc=c+dc; if (rr<0||rr>7||cc<0||cc>7) continue; const t=pieceAt(state.board, rr, cc); if (!t || (side==='w'?isBlack(t):isWhite(t))) pushMove(out,{r,c},{r:rr,c:cc}, t?{capture:t}:{})
  }
  // Castling
  if (side==='w' && r===6) {
    // This r===6 is wrong; white king starts at row 7. We'll handle by reading actual king position.
  }
  const rights = state.castling;
  if (side==='w' && r===7 && c===4) {
    // King side
    if (rights.K && !pieceAt(state.board,7,5) && !pieceAt(state.board,7,6)) {
      if (!squareAttacked(state,{r:7,c:4},'b') && !squareAttacked(state,{r:7,c:5},'b') && !squareAttacked(state,{r:7,c:6},'b')) {
        pushMove(out,{r:7,c:4},{r:7,c:6},{castle:'K'});
      }
    }
    // Queen side
    if (rights.Q && !pieceAt(state.board,7,1) && !pieceAt(state.board,7,2) && !pieceAt(state.board,7,3)) {
      if (!squareAttacked(state,{r:7,c:4},'b') && !squareAttacked(state,{r:7,c:3},'b') && !squareAttacked(state,{r:7,c:2},'b')) {
        pushMove(out,{r:7,c:4},{r:7,c:2},{castle:'Q'});
      }
    }
  }
  if (side==='b' && r===0 && c===4) {
    if (rights.k && !pieceAt(state.board,0,5) && !pieceAt(state.board,0,6)) {
      if (!squareAttacked(state,{r:0,c:4},'w') && !squareAttacked(state,{r:0,c:5},'w') && !squareAttacked(state,{r:0,c:6},'w')) {
        pushMove(out,{r:0,c:4},{r:0,c:6},{castle:'k'});
      }
    }
    if (rights.q && !pieceAt(state.board,0,1) && !pieceAt(state.board,0,2) && !pieceAt(state.board,0,3)) {
      if (!squareAttacked(state,{r:0,c:4},'w') && !squareAttacked(state,{r:0,c:3},'w') && !squareAttacked(state,{r:0,c:2},'w')) {
        pushMove(out,{r:0,c:4},{r:0,c:2},{castle:'q'});
      }
    }
  }
}

export function makeMove(state, move, options = {}) {
  const { skipResult = false } = options;
  const { board } = state; const from=move.from, to=move.to; const p = pieceAt(board, from.r, from.c);
  // halfmove clock
  if (p.toUpperCase()==='P' || move.capture || move.enPassant) state.halfmove = 0; else state.halfmove++;
  // en passant capture
  if (move.enPassant) {
    const dir = state.turn==='w'?-1:1; setPiece(board, to.r - dir, to.c, '');
  }
  // move piece
  setPiece(board, to.r, to.c, move.promotion ? (state.turn==='w'?move.promotion:move.promotion.toLowerCase()) : p);
  setPiece(board, from.r, from.c, '');
  // castling move rook
  if (move.castle) {
    if (move.castle==='K') { setPiece(board,7,5,'R'); setPiece(board,7,7,''); }
    if (move.castle==='Q') { setPiece(board,7,3,'R'); setPiece(board,7,0,''); }
    if (move.castle==='k') { setPiece(board,0,5,'r'); setPiece(board,0,7,''); }
    if (move.castle==='q') { setPiece(board,0,3,'r'); setPiece(board,0,0,''); }
  }
  // update castling rights on king or rook moves or captures
  if (p === 'K') { state.castling.K = false; state.castling.Q = false; }
  if (p === 'k') { state.castling.k = false; state.castling.q = false; }
  if (from.r===7 && from.c===7) state.castling.K = false;
  if (from.r===7 && from.c===0) state.castling.Q = false;
  if (from.r===0 && from.c===7) state.castling.k = false;
  if (from.r===0 && from.c===0) state.castling.q = false;
  if (to.r===7 && to.c===7) state.castling.K = false;
  if (to.r===7 && to.c===0) state.castling.Q = false;
  if (to.r===0 && to.c===7) state.castling.k = false;
  if (to.r===0 && to.c===0) state.castling.q = false;
  // set new ep square
  if (move.doublePawn) state.ep = { r: (state.turn==='w'?from.r-1:from.r+1), c: from.c }; else state.ep = null;
  // turn switch
  state.turn = state.turn==='w' ? 'b' : 'w';
  if (state.turn==='w') state.fullmove++;

  // Checkmate/stalemate detection
  if (!skipResult) {
    const legal = generateLegalMoves(state);
    if (legal.length === 0) {
      if (inCheck(state, state.turn)) state.result = { outcome: 'checkmate', message: (state.turn==='w'?'White':'Black') + ' is checkmated' };
      else state.result = { outcome: 'stalemate', message: 'Stalemate' };
    }
  }
}

export function toSAN(prevState, move) {
  const { board } = prevState; const p = pieceAt(board, move.from.r, move.from.c).toUpperCase();
  if (move.castle) return (move.castle==='K'||move.castle==='k') ? 'O-O' : 'O-O-O';
  const pieceLetter = p==='P' ? '' : p;
  const capture = move.capture || move.enPassant ? 'x' : '';
  const dest = rcToAlgebra(move.to);
  const promo = move.promotion ? '=' + move.promotion : '';
  // Check indicator
  const tmp = cloneState(prevState); makeMove(tmp, JSON.parse(JSON.stringify(move)), { skipResult: true });
  const legalAfter = generateLegalMoves(tmp);
  const isCheck = inCheck(tmp, tmp.turn);
  let suffix = '';
  if (tmp.result?.outcome === 'checkmate') suffix = '#'; else if (isCheck) suffix = '+';
  // Pawn captures include file letter
  let pawnFile = '';
  if (p==='P' && capture) pawnFile = rcToAlgebra(move.from)[0];
  return `${pieceLetter}${pawnFile}${capture}${dest}${promo}${suffix}`;
}

