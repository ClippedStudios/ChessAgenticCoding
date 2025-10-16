import { generateLegalMoves, makeMove, pieceAt } from '../chess/rules.js';

const DEFAULT_WEIGHTS = {
  pawnValue: 100,
  knightValue: 320,
  bishopValue: 330,
  rookValue: 500,
  queenValue: 900,
  checkPenalty: -800,
  castleBonus: 40,
  isolatedPenalty: -12,
  passedBonus: 35,
  passedRankBonus: 5,
  doubledPenalty: -8,
  mobilityBonus: 5,
  knightCenterBonus: 8,
  bishopActivityBonus: 6,
  rookOpenBonus: 12,
  queenEarlyPenalty: -12,
};

const PIECE_WEIGHTS = {
  P: 'pawnValue',
  N: 'knightValue',
  B: 'bishopValue',
  R: 'rookValue',
  Q: 'queenValue',
  K: null,
};

const KNIGHT_OFFSETS = [
  [-2, -1], [-2, 1], [-1, -2], [-1, 2],
  [1, -2], [1, 2], [2, -1], [2, 1],
];

const BISHOP_DIRS = [
  [-1, -1], [-1, 1], [1, -1], [1, 1],
];

const ROOK_DIRS = [
  [-1, 0], [1, 0], [0, -1], [0, 1],
];

const KING_DIRS = [
  [-1, -1], [-1, 0], [-1, 1],
  [0, -1],           [0, 1],
  [1, -1],  [1, 0],  [1, 1],
];

function moveToNotation(move) {
  if (!move) return "";
  const fromFile = String.fromCharCode(97 + move.from.c);
  const fromRank = 8 - move.from.r;
  const toFile = String.fromCharCode(97 + move.to.c);
  const toRank = 8 - move.to.r;
  const promo = move.promotion ? `=${move.promotion.toUpperCase()}` : "";
  return `${fromFile}${fromRank}${toFile}${toRank}${promo}`;
}

function sanitizeWeights(raw) {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_WEIGHTS };
  const result = { ...DEFAULT_WEIGHTS };
  for (const key of Object.keys(DEFAULT_WEIGHTS)) {
    const value = Number(raw[key]);
    if (Number.isFinite(value)) {
      result[key] = Math.max(-5000, Math.min(5000, value));
    }
  }
  return result;
}

function cloneStateFast(state) {
  const board = Array.from({ length: 8 }, (_, r) => state.board[r].slice());
  return {
    board,
    turn: state.turn,
    castling: { ...state.castling },
    ep: state.ep ? { ...state.ep } : null,
    halfmove: state.halfmove,
    fullmove: state.fullmove,
  };
}

function sideOfPiece(piece) {
  if (!piece) return null;
  return piece === piece.toUpperCase() ? 'w' : 'b';
}

function isCastled(kingPos, side) {
  if (!kingPos) return false;
  if (side === 'w') return kingPos.r === 7 && (kingPos.c === 6 || kingPos.c === 2);
  return kingPos.r === 0 && (kingPos.c === 6 || kingPos.c === 2);
}

function isPassed(pawn, side, enemyPawnBoard) {
  const dir = side === 'w' ? -1 : 1;
  let r = pawn.r + dir;
  while (r >= 0 && r <= 7) {
    for (let dc = -1; dc <= 1; dc += 1) {
      const c = pawn.c + dc;
      if (c < 0 || c > 7) continue;
      if (enemyPawnBoard[r][c]) return false;
    }
    r += dir;
  }
  return true;
}

function pawnStats(pawns, side, enemyPawnBoard) {
  const files = Array(8).fill(0);
  for (const pawn of pawns) files[pawn.c] += 1;

  let isolated = 0;
  let doubled = 0;
  let passed = 0;
  let passedAdvance = 0;

  for (let file = 0; file < 8; file += 1) {
    const count = files[file];
    if (count > 1) doubled += count - 1;
  }

  for (const pawn of pawns) {
    const left = pawn.c > 0 ? files[pawn.c - 1] : 0;
    const right = pawn.c < 7 ? files[pawn.c + 1] : 0;
    if (left === 0 && right === 0) isolated += 1;
    if (isPassed(pawn, side, enemyPawnBoard)) {
      passed += 1;
      const advance = side === 'w' ? 6 - pawn.r : pawn.r - 1;
      passedAdvance += Math.max(advance, 0);
    }
  }

  return { isolated, doubled, passed, passedAdvance };
}

function pieceMobility(board, piece, side) {
  const type = piece.type;
  let mobility = 0;

  if (type === 'N') {
    for (const [dr, dc] of KNIGHT_OFFSETS) {
      const r = piece.r + dr;
      const c = piece.c + dc;
      if (r < 0 || r > 7 || c < 0 || c > 7) continue;
      const target = pieceAt(board, r, c);
      if (!target || sideOfPiece(target) !== side) mobility += 1;
    }
    return mobility;
  }

  if (type === 'B' || type === 'R' || type === 'Q') {
    const dirs = type === 'B'
      ? BISHOP_DIRS
      : type === 'R'
        ? ROOK_DIRS
        : [...BISHOP_DIRS, ...ROOK_DIRS];
    for (const [dr, dc] of dirs) {
      let r = piece.r + dr;
      let c = piece.c + dc;
      while (r >= 0 && r <= 7 && c >= 0 && c <= 7) {
        const target = pieceAt(board, r, c);
        if (!target) mobility += 1;
        else {
          if (sideOfPiece(target) !== side) mobility += 1;
          break;
        }
        r += dr;
        c += dc;
      }
    }
    return mobility;
  }

  if (type === 'P') {
    const dir = side === 'w' ? -1 : 1;
    const forward = piece.r + dir;
    if (forward >= 0 && forward <= 7) {
      if (!pieceAt(board, forward, piece.c)) mobility += 1;
      for (const dc of [-1, 1]) {
        const c = piece.c + dc;
        if (c < 0 || c > 7) continue;
        const target = pieceAt(board, forward, c);
        if (target && sideOfPiece(target) !== side) mobility += 1;
      }
    }
    return mobility;
  }

  if (type === 'K') {
    for (const [dr, dc] of KING_DIRS) {
      const r = piece.r + dr;
      const c = piece.c + dc;
      if (r < 0 || r > 7 || c < 0 || c > 7) continue;
      const target = pieceAt(board, r, c);
      if (!target || sideOfPiece(target) !== side) mobility += 1;
    }
    return mobility;
  }

  return mobility;
}

function evaluatePosition(state, perspective, weights) {
  const board = state.board;
  const enemy = perspective === 'w' ? 'b' : 'w';
  let score = 0;

  const myPawns = [];
  const enemyPawns = [];
  const myPawnBoard = Array.from({ length: 8 }, () => Array(8).fill(false));
  const enemyPawnBoard = Array.from({ length: 8 }, () => Array(8).fill(false));
  let myKing = null;
  let enemyKing = null;
  let myQueenMoved = false;
  let enemyQueenMoved = false;
  let myMobility = 0;
  let enemyMobility = 0;
  let myKnightCenter = 0;
  let enemyKnightCenter = 0;

  for (let r = 0; r < 8; r += 1) {
    for (let c = 0; c < 8; c += 1) {
      const piece = board[r][c];
      if (!piece) continue;
      const type = piece.toUpperCase();
      const side = piece === piece.toUpperCase() ? 'w' : 'b';
      const valueKey = PIECE_WEIGHTS[type];
      const entry = { type, r, c };

      if (valueKey) {
        const material = weights[valueKey] || 0;
        score += side === perspective ? material : -material;
      }

      const mobility = pieceMobility(board, entry, side);
      if (side === perspective) myMobility += mobility;
      else enemyMobility += mobility;

      if (type === 'N' && r >= 2 && r <= 5 && c >= 2 && c <= 5) {
        if (side === perspective) {
          myKnightCenter += (r >= 3 && r <= 4 && c >= 3 && c <= 4) ? 1.5 : 1;
        } else {
          enemyKnightCenter += (r >= 3 && r <= 4 && c >= 3 && c <= 4) ? 1.5 : 1;
        }
      }

      if (side === perspective) {
        if (type === 'P') {
          myPawns.push(entry);
          myPawnBoard[r][c] = true;
        } else if (type === 'K') {
          myKing = { r, c };
        } else if (type === 'Q' && !(perspective === 'w' && r === 7 && c === 3) && !(perspective === 'b' && r === 0 && c === 3)) {
          myQueenMoved = true;
        }
      } else {
        if (type === 'P') {
          enemyPawns.push(entry);
          enemyPawnBoard[r][c] = true;
        } else if (type === 'K') {
          enemyKing = { r, c };
        } else if (type === 'Q' && !(enemy === 'w' && r === 7 && c === 3) && !(enemy === 'b' && r === 0 && c === 3)) {
          enemyQueenMoved = true;
        }
      }
    }
  }

  if (myKing && isCastled(myKing, perspective)) score += weights.castleBonus;
  if (enemyKing && isCastled(enemyKing, enemy)) score -= weights.castleBonus;

  if (state.turn === enemy && state.turn !== perspective) {
    score += weights.checkPenalty;
  }

  const myStats = pawnStats(myPawns, perspective, enemyPawnBoard);
  const enemyStats = pawnStats(enemyPawns, enemy, myPawnBoard);
  score += weights.isolatedPenalty * (myStats.isolated - enemyStats.isolated);
  score += weights.doubledPenalty * (myStats.doubled - enemyStats.doubled);
  score += weights.passedBonus * (myStats.passed - enemyStats.passed);
  score += weights.passedRankBonus * (myStats.passedAdvance - enemyStats.passedAdvance);

  score += weights.mobilityBonus * (myMobility - enemyMobility);
  score += weights.knightCenterBonus * (myKnightCenter - enemyKnightCenter);

  if (state.fullmove <= 10) {
    if (myQueenMoved) score += weights.queenEarlyPenalty;
    if (enemyQueenMoved) score -= weights.queenEarlyPenalty;
  }

  return score;
}

function movePriority(move) {
  let score = 0;
  if (move.capture) {
    const target = move.capture.toUpperCase();
    const key = PIECE_WEIGHTS[target];
    score += key ? (DEFAULT_WEIGHTS[key] || 100) * 2 : 200;
  }
  if (move.promotion) {
    const promoKey = PIECE_WEIGHTS[move.promotion.toUpperCase()];
    score += promoKey ? (DEFAULT_WEIGHTS[promoKey] || 400) * 3 : 400;
  }
  if (move.enPassant) score += 120;
  if (move.castle) score += 80;
  return score;
}

function chooseBestMove(state, side, timeLimitMs, weights) {
  const moves = generateLegalMoves(state);
  if (!moves.length) return { move: null, score: 0, elapsed: 0 };

  const baseline = evaluatePosition(state, side, weights);
  let bestMove = null;
  let bestGain = -Infinity;
  let bestScore = -Infinity;

  const start = performance.now();
  const deadline = timeLimitMs > 0 ? start + timeLimitMs : Infinity;
  const MAX_MOVES = 24;
  const ordered = moves
    .map((move) => ({ move, priority: movePriority(move) }))
    .sort((a, b) => b.priority - a.priority)
    .slice(0, MAX_MOVES);

  for (const { move } of ordered) {
    if (timeLimitMs > 0 && performance.now() > deadline) break;
    const nextState = cloneStateFast(state);
    makeMove(nextState, move, { skipResult: true });
    const score = evaluatePosition(nextState, side, weights);
    const gain = score - baseline;
    if (!bestMove || gain > bestGain || (gain === bestGain && score > bestScore)) {
      bestMove = move;
      bestGain = gain;
      bestScore = score;
    }
  }

  if (!bestMove && moves.length) bestMove = moves[0];

  const elapsed = performance.now() - start;
  if (!bestMove) {
    return { move: null, score: 0, elapsed };
  }

  return {
    move: {
      from: { r: bestMove.from.r, c: bestMove.from.c },
      to: { r: bestMove.to.r, c: bestMove.to.c },
      promotion: bestMove.promotion || null,
    },
    score: bestGain,
    elapsed,
  };
}

self.addEventListener('message', (event) => {
  const { data } = event;
  if (!data || data.type !== 'analyze') return;

  const {
    state,
    side,
    timeLimitMs = 10000,
    fastWeights = null,
  } = data;

  const weights = sanitizeWeights(fastWeights);
  const result = chooseBestMove(state, side, Math.max(0, timeLimitMs), weights);

  const moveNotation = moveToNotation(result.move);

  self.postMessage({
    type: 'result',
    move: result.move,
    line: result.move ? [result.move] : [],
    moveNotation,
    lineNotation: result.move ? [moveNotation] : [],
    score: result.score,
    elapsed: result.elapsed,
  });
});
