import { generateLegalMoves, makeMove, cloneState, inCheck, rcToAlgebra } from '../chess/rules.js';

let aggressionFactor = 0.25;

const PIECE_VALUES = { P: 100, N: 320, B: 330, R: 500, Q: 900, K: 20000 };

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function baseEvaluation(state) {
  let score = 0;
  const board = state.board;
  for (let r = 0; r < 8; r += 1) {
    for (let c = 0; c < 8; c += 1) {
      const piece = board[r][c];
      if (!piece) continue;
      const value = PIECE_VALUES[piece.toUpperCase()] || 0;
      score += piece === piece.toUpperCase() ? value : -value;
    }
  }
  return score;
}

function mobilityCount(state, side) {
  const temp = cloneState(state);
  temp.turn = side;
  return generateLegalMoves(temp).length;
}

function evaluate(state, perspective) {
  const material = baseEvaluation(state);
  const perspectiveMaterial = perspective === 'w' ? material : -material;

  const myMobility = mobilityCount(state, perspective);
  const oppMobility = mobilityCount(state, perspective === 'w' ? 'b' : 'w');
  const positionalDiff = myMobility - oppMobility;
  const positionalScore = positionalDiff * 4;

  let sacrificeBonus = 0;
  if (positionalScore > 0 && perspectiveMaterial < 0) {
    sacrificeBonus = aggressionFactor * Math.min(Math.abs(perspectiveMaterial), positionalScore);
  } else if (positionalScore < 0 && perspectiveMaterial > 0) {
    sacrificeBonus = -aggressionFactor * Math.min(perspectiveMaterial, Math.abs(positionalScore));
  }

  return perspectiveMaterial + positionalScore + sacrificeBonus;
}

function orderMoves(moves) {
  return moves
    .slice()
    .sort((a, b) => {
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

function runRandomSampling(state, side, sampleWindowMs = 2000) {
  const legal = orderMoves(generateLegalMoves(state));
  const start = performance.now();
  const baseClone = cloneState(state);
  if (!legal.length) {
    self.postMessage({
      type: 'result',
      move: null,
      line: [],
      moveNotation: '',
      score: 0,
      samples: 0,
      elapsed: 0,
    });
    return;
  }

  let bestMove = null;
  let bestScore = -Infinity;
  let samples = 0;
  const window = Math.max(0, sampleWindowMs);

  do {
    const move = legal[Math.floor(Math.random() * legal.length)];
    const sampleState = cloneState(baseClone);
    makeMove(sampleState, move, { skipResult: true });
    const score = evaluate(sampleState, side);
    samples += 1;
    const elapsed = performance.now() - start;
    self.postMessage({
      type: 'sample',
      move,
      moveNotation: moveToNotation(move),
      score,
      samples,
      elapsed,
      line: [move],
    });
    if (score > bestScore || !bestMove) {
      bestScore = score;
      bestMove = move;
    }
    if (elapsed >= window) break;
  } while (true);

  self.postMessage({
    type: 'result',
    move: bestMove,
    line: bestMove ? [bestMove] : [],
    moveNotation: moveToNotation(bestMove),
    score: bestScore === -Infinity ? 0 : bestScore,
    samples,
    elapsed: performance.now() - start,
  });
}

self.addEventListener('message', (event) => {
  const { data } = event;
  if (!data || data.type !== 'analyze') return;

  const {
    state,
    side,
    depth = 2,
    timeLimitMs = 10000,
    sampleWindowMs = timeLimitMs,
    mode = 'search',
    sacrificeBias = 0.25,
  } = data;

  aggressionFactor = clamp01(sacrificeBias);

  if (mode === 'random') {
    runRandomSampling(state, side, sampleWindowMs);
    return;
  }

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

