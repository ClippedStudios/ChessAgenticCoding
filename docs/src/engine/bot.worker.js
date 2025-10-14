import { generateLegalMoves, makeMove, cloneState, inCheck } from '../chess/rules.js';

const PIECE_VALUES = { P: 100, N: 320, B: 330, R: 500, Q: 900, K: 20000 };

function baseEvaluation(state) {
  let score = 0;
  const board = state.board;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (!p) continue;
      const val = PIECE_VALUES[p.toUpperCase()] || 0;
      score += p === p.toUpperCase() ? val : -val;
    }
  }
  return score;
}

function evaluate(state, side) {
  const material = baseEvaluation(state);
  let mobility = 0;
  try {
    mobility = generateLegalMoves(state).length;
  } catch (_) {
    mobility = 0;
  }
  const mobilityScore = Math.min(mobility, 30) * 5 * (state.turn === 'w' ? 1 : -1);
  const total = material + mobilityScore;
  return side === 'w' ? total : -total;
}

function orderMoves(moves) {
  return moves.slice().sort((a, b) => {
    const av = (a.capture ? 1000 : 0) + (a.promotion ? 500 : 0);
    const bv = (b.capture ? 1000 : 0) + (b.promotion ? 500 : 0);
    return bv - av;
  });
}

function minimax(state, depth, alpha, beta, botSide, start, timeLimitMs) {
  if (timeLimitMs && performance.now() - start > timeLimitMs) {
    return { score: evaluate(state, botSide), move: null, timedOut: true };
  }

  const moves = orderMoves(generateLegalMoves(state));
  if (depth === 0 || moves.length === 0) {
    if (moves.length === 0) {
      if (inCheck(state, state.turn)) {
        const mateScore = (state.turn === botSide ? -1 : 1) * 100000;
        return { score: mateScore, move: null };
      }
      return { score: 0, move: null };
    }
    return { score: evaluate(state, botSide), move: null };
  }

  const maximizing = state.turn === botSide;
  let bestScore = maximizing ? -Infinity : Infinity;
  let bestMove = null;

  for (const move of moves) {
    const next = cloneState(state);
    makeMove(next, move, { skipResult: true });
    const child = minimax(next, depth - 1, alpha, beta, botSide, start, timeLimitMs);
    if (child.timedOut) {
      if (bestMove) {
        return { score: bestScore, move: bestMove, timedOut: true };
      }
      return { score: child.score, move, timedOut: true };
    }
    const value = child.score;
    if (maximizing) {
      if (value > bestScore || bestMove === null) {
        bestScore = value;
        bestMove = move;
      }
      alpha = Math.max(alpha, value);
    } else {
      if (value < bestScore || bestMove === null) {
        bestScore = value;
        bestMove = move;
      }
      beta = Math.min(beta, value);
    }
    if (beta <= alpha) break;
  }

  return { score: bestScore, move: bestMove };
}

self.addEventListener('message', (event) => {
  const { state, side, depth = 2, timeLimitMs = 1500 } = event.data;
  const start = performance.now();
  let bestMove = null;
  let currentDepth = Math.max(1, depth);

  while (currentDepth <= depth + 1) {
    const searchState = cloneState(state);
    const result = minimax(searchState, currentDepth, -Infinity, Infinity, side, start, timeLimitMs);
    if (result.move) bestMove = result.move;
    if (result.timedOut) break;
    currentDepth++;
    if (timeLimitMs && performance.now() - start > timeLimitMs) break;
  }

  self.postMessage({ move: bestMove });
});


