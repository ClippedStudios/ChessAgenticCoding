import { generateLegalMoves, makeMove, cloneState, inCheck, rcToAlgebra } from '../chess/rules.js';

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
  const perspectiveMaterial = side === 'w' ? material : -material;
  const sacrificeBias = -0.08 * perspectiveMaterial;
  const total = material + mobilityScore + sacrificeBias;
  return side === 'w' ? total : -total;
}

function orderMoves(moves) {
  return moves.slice().sort((a, b) => {
    const av = (a.capture ? 1000 : 0) + (a.promotion ? 500 : 0);
    const bv = (b.capture ? 1000 : 0) + (b.promotion ? 500 : 0);
    return bv - av;
  });
}

function moveToNotation(move) {
  if (!move) return '';
  const from = rcToAlgebra(move.from);
  const to = rcToAlgebra(move.to);
  const promo = move.promotion ? `=${move.promotion}` : '';
  return `${from}${to}${promo}`;
}

function minimax(state, depth, alpha, beta, botSide, start, timeLimitMs) {
  if (timeLimitMs && performance.now() - start > timeLimitMs) {
    return { score: evaluate(state, botSide), move: null, line: [], timedOut: true };
  }

  const moves = orderMoves(generateLegalMoves(state));
  if (depth === 0 || moves.length === 0) {
    if (moves.length === 0) {
      if (inCheck(state, state.turn)) {
        const mateScore = (state.turn === botSide ? -1 : 1) * 100000;
        return { score: mateScore, move: null, line: [] };
      }
      return { score: 0, move: null, line: [] };
    }
    return { score: evaluate(state, botSide), move: null, line: [] };
  }

  const maximizing = state.turn === botSide;
  let bestScore = maximizing ? -Infinity : Infinity;
  let bestMove = null;
  let bestLine = [];

  for (const move of moves) {
    const next = cloneState(state);
    makeMove(next, move, { skipResult: true });
    const child = minimax(next, depth - 1, alpha, beta, botSide, start, timeLimitMs);
    if (child.timedOut) {
      if (bestMove) {
        return { score: bestScore, move: bestMove, line: bestLine, timedOut: true };
      }
      return {
        score: child.score,
        move,
        line: [move, ...(child.line || [])],
        timedOut: true,
      };
    }
    const value = child.score;
    const moveLine = [move, ...(child.line || [])];
    if (maximizing) {
      if (value > bestScore || bestMove === null) {
        bestScore = value;
        bestMove = move;
        bestLine = moveLine;
      }
      alpha = Math.max(alpha, value);
    } else {
      if (value < bestScore || bestMove === null) {
        bestScore = value;
        bestMove = move;
        bestLine = moveLine;
      }
      beta = Math.min(beta, value);
    }
    if (beta <= alpha) break;
  }

  return { score: bestScore, move: bestMove, line: bestLine };
}

self.addEventListener('message', (event) => {
  const { data } = event;
  if (!data || data.type !== 'analyze') return;
  const { state, side, depth = 2, timeLimitMs = 10_000 } = data;
  const start = performance.now();
  let bestMove = null;
  let bestLine = [];
  let bestScoreValue = null;
  let currentDepth = Math.max(1, depth);

  while (currentDepth <= depth + 1) {
    const searchState = cloneState(state);
    const result = minimax(searchState, currentDepth, -Infinity, Infinity, side, start, timeLimitMs);
    if (result.move) {
      bestMove = result.move;
      bestLine = result.line && result.line.length ? result.line : [result.move];
      bestScoreValue = result.score;
    }
    self.postMessage({
      type: 'pv',
      depth: currentDepth,
      line: result.line && result.line.length ? result.line : (result.move ? [result.move] : []),
      currentMove: moveToNotation(result.line && result.line.length ? result.line[0] : result.move),
      lineNotation: (result.line || []).map(moveToNotation),
      score: result.score,
      elapsed: performance.now() - start,
    });
    if (result.timedOut) break;
    currentDepth += 1;
    if (timeLimitMs && performance.now() - start > timeLimitMs) break;
  }

  self.postMessage({
    type: 'result',
    move: bestMove,
    line: bestLine,
    moveNotation: moveToNotation(bestMove),
    lineNotation: bestLine.map(moveToNotation),
    score: bestScoreValue ?? 0,
    elapsed: performance.now() - start,
  });
});

