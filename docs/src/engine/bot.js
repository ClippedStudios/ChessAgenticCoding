import { generateLegalMoves, makeMove, cloneState } from '../chess/rules.js';

const PIECE_VALUES = { P: 100, N: 320, B: 330, R: 500, Q: 900, K: 0 };

function evaluate(state, side) {
  // Simple material + mobility evaluation from side's perspective
  let score = 0;
  const b = state.board;
  for (let r=0;r<8;r++) for (let c=0;c<8;c++) {
    const p = b[r][c]; if (!p) continue;
    const val = PIECE_VALUES[p.toUpperCase()] || 0;
    score += (p===p.toUpperCase()?val:-val);
  }
  const mob = generateLegalMoves(state).length;
  score += (state.turn==='w'?1:-1) * Math.min(10, mob);
  return side==='w' ? score : -score;
}

function orderMoves(moves) {
  // Simple MVV-LVA approximation: captures first, promotions next
  return moves.sort((a,b)=>{
    const av = (a.capture?1:0) + (a.promotion?0.5:0);
    const bv = (b.capture?1:0) + (b.promotion?0.5:0);
    return bv - av;
  });
}

function minimax(state, depth, alpha, beta, side) {
  if (depth === 0 || state.result) return { score: evaluate(state, side) };
  const moves = orderMoves(generateLegalMoves(state));
  if (moves.length === 0) return { score: evaluate(state, side) };
  let best = null;
  for (const m of moves) {
    const s2 = cloneState(state); makeMove(s2, m);
    const val = minimax(s2, depth - 1, alpha, beta, side).score;
    if (state.turn === side) {
      if (best === null || val > best.score) best = { score: val, move: m };
      alpha = Math.max(alpha, val);
      if (beta <= alpha) break;
    } else {
      if (best === null || val < best.score) best = { score: val, move: m };
      beta = Math.min(beta, val);
      if (beta <= alpha) break;
    }
  }
  return best || { score: evaluate(state, side) };
}

export class Bot {
  constructor(side) { this.side = side; }
  chooseMove(game, depth = 2, timeLimitMs = 1200) {
    const state = game.state;
    const start = Date.now();
    // Shallow search for responsiveness
    let best = minimax(cloneState(state), depth, -1e9, 1e9, this.side);
    // If time remains and game is quiet, optionally deepen by 1
    if (Date.now() - start < timeLimitMs/4) {
      const deeper = minimax(cloneState(state), depth + 1, -1e9, 1e9, this.side);
      if (deeper.move) best = deeper;
    }
    return best.move || null;
  }
}

