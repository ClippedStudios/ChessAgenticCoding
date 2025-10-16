import { generateLegalMoves, makeMove, cloneState, inCheck, rcToAlgebra, pieceAt } from '../chess/rules.js';

let stopRequested = false;
let aggressionFactor = 0.25;

const PIECE_VALUES = { P: 100, N: 325, B: 330, R: 500, Q: 950, K: 20000 };
const PIECE_PHASE = { P: 0, N: 1, B: 1, R: 2, Q: 4, K: 0 };

const KNIGHT_OFFSETS = [
  [-2, -1],
  [-2, 1],
  [-1, -2],
  [-1, 2],
  [1, -2],
  [1, 2],
  [2, -1],
  [2, 1],
];

const BISHOP_DIRS = [
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1],
];

const ROOK_DIRS = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];

const KING_DIRS = [
  [-1, -1],
  [-1, 0],
  [-1, 1],
  [0, -1],
  [0, 1],
  [1, -1],
  [1, 0],
  [1, 1],
];

const CENTER_SQUARES = [
  { r: 3, c: 3 },
  { r: 3, c: 4 },
  { r: 4, c: 3 },
  { r: 4, c: 4 },
];

const EXTENDED_CENTER = [
  { r: 2, c: 2 },
  { r: 2, c: 3 },
  { r: 2, c: 4 },
  { r: 2, c: 5 },
  { r: 3, c: 2 },
  { r: 3, c: 5 },
  { r: 4, c: 2 },
  { r: 4, c: 5 },
  { r: 5, c: 2 },
  { r: 5, c: 3 },
  { r: 5, c: 4 },
  { r: 5, c: 5 },
];

const KING_ZONE_EXTENTS = [
  { dr: -2, dc: -2 },
  { dr: -2, dc: -1 },
  { dr: -2, dc: 0 },
  { dr: -2, dc: 1 },
  { dr: -2, dc: 2 },
  { dr: -1, dc: -2 },
  { dr: -1, dc: 2 },
  { dr: 0, dc: -2 },
  { dr: 0, dc: 2 },
  { dr: 1, dc: -2 },
  { dr: 1, dc: 2 },
  { dr: 2, dc: -2 },
  { dr: 2, dc: -1 },
  { dr: 2, dc: 0 },
  { dr: 2, dc: 1 },
  { dr: 2, dc: 2 },
];

const MAX_KILLERS = 2;
const NEG_INF = -1_000_000_000;
const POS_INF = 1_000_000_000;
const PV_UPDATE_INTERVAL_MS = 140;

function encodeStateKey(state) {
  let key = state.turn;
  for (let r = 0; r < 8; r += 1) {
    const row = state.board[r];
    for (let c = 0; c < 8; c += 1) {
      key += row[c] || '.';
    }
  }
  key += state.castling.K ? 'K' : '';
  key += state.castling.Q ? 'Q' : '';
  key += state.castling.k ? 'k' : '';
  key += state.castling.q ? 'q' : '';
  if (state.ep) {
    key += `e${state.ep.r}${state.ep.c}`;
  }
  key += `:${state.halfmove}:${state.fullmove}`;
  return key;
}

function clamp01(value) {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function squareIndex(r, c) {
  return r * 8 + c;
}

function mirrorIndex(index) {
  const rank = Math.floor(index / 8);
  const file = index % 8;
  return (7 - rank) * 8 + file;
}

const PST_MG = {
  P: [
    0, 5, 5, 0, 0, 5, 5, 0,
    20, 20, 15, 10, 10, 15, 20, 20,
    6, 6, 8, 20, 20, 8, 6, 6,
    4, 4, 10, 25, 25, 10, 4, 4,
    0, 0, 0, 20, 20, 0, 0, 0,
    6, -2, -4, 10, 10, -4, -2, 6,
    6, 8, 8, -8, -8, 8, 8, 6,
    0, 0, 0, 0, 0, 0, 0, 0,
  ],
  N: [
    -50, -40, -30, -30, -30, -30, -40, -50,
    -40, -20, 0, 5, 5, 0, -20, -40,
    -30, 5, 10, 15, 15, 10, 5, -30,
    -30, 0, 15, 20, 20, 15, 0, -30,
    -30, 5, 15, 20, 20, 15, 5, -30,
    -30, 0, 10, 15, 15, 10, 0, -30,
    -40, -20, 0, 0, 0, 0, -20, -40,
    -50, -40, -30, -30, -30, -30, -40, -50,
  ],
  B: [
    -20, -10, -10, -10, -10, -10, -10, -20,
    -10, 0, 0, 0, 0, 0, 0, -10,
    -10, 0, 5, 10, 10, 5, 0, -10,
    -10, 5, 5, 10, 10, 5, 5, -10,
    -10, 0, 10, 10, 10, 10, 0, -10,
    -10, 10, 10, 10, 10, 10, 10, -10,
    -10, 5, 0, 0, 0, 0, 5, -10,
    -20, -10, -10, -10, -10, -10, -10, -20,
  ],
  R: [
    0, 0, 0, 10, 10, 0, 0, 0,
    0, 5, 5, 10, 10, 5, 5, 0,
    0, 0, 0, 10, 10, 0, 0, 0,
    0, 0, 0, 10, 10, 0, 0, 0,
    0, 0, 0, 10, 10, 0, 0, 0,
    0, 0, 0, 10, 10, 0, 0, 0,
    5, 5, 5, 15, 15, 5, 5, 5,
    0, 0, 0, 10, 10, 0, 0, 0,
  ],
  Q: [
    -10, -5, -5, 0, 0, -5, -5, -10,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 5, 5, 5, 5, 0, -5,
    0, 0, 5, 5, 5, 5, 0, 0,
    -5, 0, 5, 5, 5, 5, 0, -5,
    -5, 0, 5, 5, 5, 5, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -10, -5, -5, -5, -5, -5, -5, -10,
  ],
  K: [
    30, 40, 40, 0, 0, 30, 40, 30,
    20, 30, 20, 0, 0, 20, 30, 20,
    10, 15, 10, 0, 0, 10, 15, 10,
    0, 0, 0, -5, -5, 0, 0, 0,
    -10, -10, -15, -20, -20, -15, -10, -10,
    -20, -20, -25, -30, -30, -25, -20, -20,
    -30, -30, -35, -40, -40, -35, -30, -30,
    -40, -40, -45, -50, -50, -45, -40, -40,
  ],
};

const PST_EG = {
  P: [
    0, 0, 0, 5, 5, 0, 0, 0,
    10, 10, 10, 15, 15, 10, 10, 10,
    4, 4, 8, 20, 20, 8, 4, 4,
    0, 0, 12, 24, 24, 12, 0, 0,
    -4, -4, 10, 20, 20, 10, -4, -4,
    -10, -10, 0, 10, 10, 0, -10, -10,
    -10, -10, -10, -20, -20, -10, -10, -10,
    0, 0, 0, 0, 0, 0, 0, 0,
  ],
  N: [
    -40, -20, -10, -5, -5, -10, -20, -40,
    -20, 0, 5, 10, 10, 5, 0, -20,
    -15, 5, 10, 15, 15, 10, 5, -15,
    -10, 10, 15, 20, 20, 15, 10, -10,
    -10, 5, 15, 20, 20, 15, 5, -10,
    -15, 5, 10, 15, 15, 10, 5, -15,
    -20, 0, 5, 10, 10, 5, 0, -20,
    -40, -20, -10, -5, -5, -10, -20, -40,
  ],
  B: [
    -20, -10, -10, -10, -10, -10, -10, -20,
    -10, 0, 0, 0, 0, 0, 0, -10,
    -10, 0, 10, 15, 15, 10, 0, -10,
    -10, 10, 15, 20, 20, 15, 10, -10,
    -10, 10, 15, 20, 20, 15, 10, -10,
    -10, 0, 10, 15, 15, 10, 0, -10,
    -10, 5, 0, 0, 0, 0, 5, -10,
    -20, -10, -10, -10, -10, -10, -10, -20,
  ],
  R: [
    0, 0, 5, 10, 10, 5, 0, 0,
    0, 5, 15, 15, 15, 15, 5, 0,
    0, 5, 10, 20, 20, 10, 5, 0,
    0, 5, 10, 20, 20, 10, 5, 0,
    0, 5, 10, 20, 20, 10, 5, 0,
    0, 5, 10, 15, 15, 10, 5, 0,
    5, 10, 10, 20, 20, 10, 10, 5,
    10, 10, 15, 20, 20, 15, 10, 10,
  ],
  Q: [
    -20, -10, -10, -5, -5, -10, -10, -20,
    -10, 0, 0, 0, 0, 0, 0, -10,
    -10, 0, 5, 5, 5, 5, 0, -10,
    -5, 0, 5, 5, 5, 5, 0, -5,
    -5, 0, 5, 5, 5, 5, 0, -5,
    -10, 0, 5, 5, 5, 5, 0, -10,
    -10, 0, 0, 0, 0, 0, 0, -10,
    -20, -10, -10, -5, -5, -10, -10, -20,
  ],
  K: [
    -30, -20, -10, -10, -10, -10, -20, -30,
    -10, 0, 10, 10, 10, 10, 0, -10,
    0, 10, 20, 20, 20, 20, 10, 0,
    0, 10, 20, 25, 25, 20, 10, 0,
    0, 10, 20, 25, 25, 20, 10, 0,
    0, 10, 15, 20, 20, 15, 10, 0,
    -10, 0, 10, 10, 10, 10, 0, -10,
    -30, -10, 0, 0, 0, 0, -10, -30,
  ],
};

const DEFAULT_FAST_WEIGHTS = {
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

const FAST_WEIGHT_KEYS = Object.keys(DEFAULT_FAST_WEIGHTS);

function sanitizeFastWeights(raw) {
  const weights = { ...DEFAULT_FAST_WEIGHTS };
  if (!raw || typeof raw !== 'object') return weights;
  for (const key of FAST_WEIGHT_KEYS) {
    const value = Number(raw[key]);
    if (Number.isFinite(value)) {
      weights[key] = Math.max(-5000, Math.min(5000, value));
    }
  }
  return weights;
}

function isCastled(kingPos, side) {
  if (!kingPos) return false;
  if (side === 'w') return kingPos.r === 7 && (kingPos.c === 6 || kingPos.c === 2);
  return kingPos.r === 0 && (kingPos.c === 6 || kingPos.c === 2);
}

function isPassedPawnFast(pawn, side, enemyPawnBoard) {
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

function computePawnStats(pawns, side, enemyPawnBoard) {
  const files = Array(8).fill(0);
  for (const pawn of pawns) {
    files[pawn.c] += 1;
  }
  let isolated = 0;
  let passed = 0;
  let passedAdvance = 0;
  let doubled = 0;
  for (let file = 0; file < 8; file += 1) {
    const count = files[file];
    if (count > 1) doubled += count - 1;
  }
  for (const pawn of pawns) {
    const left = pawn.c > 0 ? files[pawn.c - 1] : 0;
    const right = pawn.c < 7 ? files[pawn.c + 1] : 0;
    if (left === 0 && right === 0) isolated += 1;
    if (isPassedPawnFast(pawn, side, enemyPawnBoard)) {
      passed += 1;
      const advance = side === 'w' ? 6 - pawn.r : pawn.r - 1;
      passedAdvance += Math.max(advance, 0);
    }
  }
  return { files, isolated, doubled, passed, passedAdvance };
}

function countKnightsInCenter(knights) {
  let score = 0;
  for (const knight of knights) {
    if (knight.r >= 2 && knight.r <= 5 && knight.c >= 2 && knight.c <= 5) {
      score += 1;
      if (knight.r >= 3 && knight.r <= 4 && knight.c >= 3 && knight.c <= 4) {
        score += 0.5;
      }
    }
  }
  return score;
}

function bishopReachFrom(board, bishop) {
  let reach = 0;
  for (const [dr, dc] of BISHOP_DIRS) {
    let r = bishop.r + dr;
    let c = bishop.c + dc;
    while (r >= 0 && r <= 7 && c >= 0 && c <= 7) {
      reach += 1;
      if (board[r][c]) break;
      r += dr;
      c += dc;
    }
  }
  return reach;
}

function totalBishopReach(board, bishops) {
  let total = 0;
  for (const bishop of bishops) {
    total += bishopReachFrom(board, bishop);
  }
  return total;
}

function rookFileScore(rooks, friendlyFiles, enemyFiles) {
  let score = 0;
  for (const rook of rooks) {
    const friendly = friendlyFiles[rook.c] || 0;
    const enemy = enemyFiles[rook.c] || 0;
    if (friendly === 0) {
      score += enemy === 0 ? 1 : 0.5;
    }
  }
  return score;
}

function kingRingPressure(analysis, attackerSide, kingPos) {
  if (!kingPos) return 0;
  let pressure = 0;
  for (const [dr, dc] of KING_DIRS) {
    const r = kingPos.r + dr;
    const c = kingPos.c + dc;
    if (r < 0 || r > 7 || c < 0 || c > 7) continue;
    const attackers = attacksOnSquare(analysis, { r, c }, attackerSide);
    pressure += attackers.count;
  }
  return pressure;
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
    const startRank = side === 'w' ? 6 : 1;
    const forward = piece.r + dir;
    if (forward >= 0 && forward <= 7) {
      if (!pieceAt(board, forward, piece.c)) {
        mobility += 1;
        const doubleForward = piece.r === startRank ? piece.r + dir * 2 : null;
        if (doubleForward !== null && !pieceAt(board, doubleForward, piece.c)) mobility += 1;
      }
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


function sideOfPiece(piece) {
  if (!piece) return null;
  return piece === piece.toUpperCase() ? 'w' : 'b';
}

function isOnHomeSquare(type, side, r, c) {
  if (type === 'N') {
    if (side === 'w') return r === 7 && (c === 1 || c === 6);
    return r === 0 && (c === 1 || c === 6);
  }
  if (type === 'B') {
    if (side === 'w') return r === 7 && (c === 2 || c === 5);
    return r === 0 && (c === 2 || c === 5);
  }
  if (type === 'Q') {
    if (side === 'w') return r === 7 && c === 3;
    return r === 0 && c === 3;
  }
  if (type === 'R') {
    if (side === 'w') return r === 7 && (c === 0 || c === 7);
    return r === 0 && (c === 0 || c === 7);
  }
  if (type === 'K') {
    if (side === 'w') return r === 7 && c === 4;
    return r === 0 && c === 4;
  }
  return false;
}

function attacksOnSquare(analysis, target, side) {
  const cacheKey = `${side}:${target.r}${target.c}`;
  const cached = analysis.attackCache.get(cacheKey);
  if (cached) return cached;

  const { board } = analysis.state;
  const { r, c } = target;
  let count = 0;
  let weight = 0;
  let minValue = Infinity;

  const pawnRow = r + (side === 'w' ? 1 : -1);
  if (pawnRow >= 0 && pawnRow < 8) {
    for (const dc of [-1, 1]) {
      const cc = c + dc;
      if (cc < 0 || cc > 7) continue;
      const pawn = board[pawnRow][cc];
      if (pawn && (side === 'w' ? pawn === 'P' : pawn === 'p')) {
        count += 1;
        weight += PIECE_VALUES.P;
        if (PIECE_VALUES.P < minValue) minValue = PIECE_VALUES.P;
      }
    }
  }

  for (const [dr, dc] of KNIGHT_OFFSETS) {
    const rr = r + dr;
    const cc = c + dc;
    if (rr < 0 || rr > 7 || cc < 0 || cc > 7) continue;
    const knight = board[rr][cc];
    if (knight && (side === 'w' ? knight === 'N' : knight === 'n')) {
      count += 1;
      weight += PIECE_VALUES.N;
      if (PIECE_VALUES.N < minValue) minValue = PIECE_VALUES.N;
    }
  }

  const diagMatch = side === 'w'
    ? (p) => p === 'B' || p === 'Q'
    : (p) => p === 'b' || p === 'q';
  for (const [dr, dc] of BISHOP_DIRS) {
    let rr = r + dr;
    let cc = c + dc;
    while (rr >= 0 && rr < 8 && cc >= 0 && cc < 8) {
      const piece = board[rr][cc];
      if (piece) {
        if (diagMatch(piece)) {
          const value = PIECE_VALUES[piece.toUpperCase()];
          count += 1;
          weight += value;
          if (value < minValue) minValue = value;
        }
        break;
      }
      rr += dr;
      cc += dc;
    }
  }

  const lineMatch = side === 'w'
    ? (p) => p === 'R' || p === 'Q'
    : (p) => p === 'r' || p === 'q';
  for (const [dr, dc] of ROOK_DIRS) {
    let rr = r + dr;
    let cc = c + dc;
    while (rr >= 0 && rr < 8 && cc >= 0 && cc < 8) {
      const piece = board[rr][cc];
      if (piece) {
        if (lineMatch(piece)) {
          const value = PIECE_VALUES[piece.toUpperCase()];
          count += 1;
          weight += value;
          if (value < minValue) minValue = value;
        }
        break;
      }
      rr += dr;
      cc += dc;
    }
  }

  for (const [dr, dc] of KING_DIRS) {
    const rr = r + dr;
    const cc = c + dc;
    if (rr < 0 || rr > 7 || cc < 0 || cc > 7) continue;
    const king = board[rr][cc];
    if (king && (side === 'w' ? king === 'K' : king === 'k')) {
      count += 1;
      weight += PIECE_VALUES.K;
      if (PIECE_VALUES.K < minValue) minValue = PIECE_VALUES.K;
    }
  }

  const result = {
    count,
    weight,
    minValue: minValue === Infinity ? 0 : minValue,
  };
  analysis.attackCache.set(cacheKey, result);
  return result;
}

function mobilityFrom(state, r, c, type, side) {
  const { board } = state;
  let moves = 0;

  if (type === 'N') {
    for (const [dr, dc] of KNIGHT_OFFSETS) {
      const rr = r + dr;
      const cc = c + dc;
      if (rr < 0 || rr > 7 || cc < 0 || cc > 7) continue;
      const target = board[rr][cc];
      if (!target || sideOfPiece(target) !== side) moves += 1;
    }
    return moves;
  }

  if (type === 'B' || type === 'R' || type === 'Q') {
    const dirs = type === 'B' ? BISHOP_DIRS : type === 'R' ? ROOK_DIRS : [...BISHOP_DIRS, ...ROOK_DIRS];
    for (const [dr, dc] of dirs) {
      let rr = r + dr;
      let cc = c + dc;
      while (rr >= 0 && rr < 8 && cc >= 0 && cc < 8) {
        const target = board[rr][cc];
        if (!target) {
          moves += 1;
        } else {
          if (sideOfPiece(target) !== side) moves += 1;
          break;
        }
        rr += dr;
        cc += dc;
      }
    }
    return moves;
  }

  if (type === 'K') {
    for (const [dr, dc] of KING_DIRS) {
      const rr = r + dr;
      const cc = c + dc;
      if (rr < 0 || rr > 7 || cc < 0 || cc > 7) continue;
      const target = board[rr][cc];
      if (!target || sideOfPiece(target) !== side) moves += 1;
    }
    return moves;
  }

  if (type === 'P') {
    const dir = side === 'w' ? -1 : 1;
    const rr = r + dir;
    if (rr >= 0 && rr < 8) {
      if (!board[rr][c]) moves += 1;
      for (const dc of [-1, 1]) {
        const cc = c + dc;
        if (cc < 0 || cc > 7) continue;
        const target = board[rr][cc];
        if (target && sideOfPiece(target) !== side) moves += 1;
      }
    }
  }

  return moves;
}

function isPassedPawn(board, r, c, side) {
  const dir = side === 'w' ? -1 : 1;
  for (let rr = r + dir; rr >= 0 && rr < 8; rr += dir) {
    for (let dc = -1; dc <= 1; dc += 1) {
      const cc = c + dc;
      if (cc < 0 || cc > 7) continue;
      const piece = board[rr][cc];
      if (!piece) continue;
      if (side === 'w') {
        if (piece === piece.toLowerCase() && piece === 'p') return false;
      } else if (piece === piece.toUpperCase() && piece === 'P') {
        return false;
      }
    }
  }
  return true;
}

function pawnShield(board, kingPos, side) {
  if (!kingPos) return 0;
  const { r, c } = kingPos;
  const dir = side === 'w' ? -1 : 1;
  let score = 0;

  for (const dc of [-1, 0, 1]) {
    const rr1 = r + dir;
    const cc1 = c + dc;
    if (rr1 >= 0 && rr1 < 8 && cc1 >= 0 && cc1 < 8) {
      const pawn = pieceAt(board, rr1, cc1);
      if (side === 'w') {
        if (pawn === 'P') score += 18;
      } else if (pawn === 'p') {
        score += 18;
      }
    }
    const rr2 = r + dir * 2;
    if (rr2 >= 0 && rr2 < 8 && cc1 >= 0 && cc1 < 8) {
      const pawn = pieceAt(board, rr2, cc1);
      if (side === 'w') {
        if (pawn === 'P') score += 6;
      } else if (pawn === 'p') {
        score += 6;
      }
    }
  }
  return score;
}

function assessKingPressure(analysis, sideInfo, enemyInfo) {
  const state = analysis.state;
  const board = state.board;
  let pressure = 0;
  let safety = 0;
  const enemyColor = enemyInfo.color;

  if (sideInfo.king) {
    const target = sideInfo.king;
    const incoming = attacksOnSquare(analysis, target, enemyColor);
    const defenders = attacksOnSquare(analysis, target, sideInfo.color);
    safety += pawnShield(board, sideInfo.king, sideInfo.color);
    safety += defenders.weight * 0.08;
    safety -= incoming.weight * 0.1 + incoming.count * 10;

    for (const [dr, dc] of KING_DIRS) {
      const rr = target.r + dr;
      const cc = target.c + dc;
      if (rr < 0 || rr > 7 || cc < 0 || cc > 7) continue;
      const adj = attacksOnSquare(analysis, { r: rr, c: cc }, enemyColor);
      safety -= adj.weight * 0.04;
      if (adj.count > 0) safety -= 4;
    }
  }

  if (enemyInfo.king) {
    const enemyKing = enemyInfo.king;
    for (const [dr, dc] of KING_DIRS) {
      const rr = enemyKing.r + dr;
      const cc = enemyKing.c + dc;
      if (rr < 0 || rr > 7 || cc < 0 || cc > 7) continue;
      const attackers = attacksOnSquare(analysis, { r: rr, c: cc }, sideInfo.color);
      const defenders = attacksOnSquare(analysis, { r: rr, c: cc }, enemyColor);
      if (attackers.count) {
        pressure += Math.max(0, attackers.weight - defenders.weight * 0.7) * 0.2;
        pressure += attackers.count * 4;
      }
    }
    const direct = attacksOnSquare(analysis, enemyKing, sideInfo.color);
    if (direct.count) {
      pressure += direct.weight * 0.4 + 18;
    }
    for (const delta of KING_ZONE_EXTENTS) {
      const rr = enemyKing.r + delta.dr;
      const cc = enemyKing.c + delta.dc;
      if (rr < 0 || rr > 7 || cc < 0 || cc > 7) continue;
      const attackers = attacksOnSquare(analysis, { r: rr, c: cc }, sideInfo.color);
      if (attackers.count) pressure += attackers.weight * 0.05;
    }
  }

  if (!sideInfo.hasCastled && sideInfo.phaseWeight > 0.6) {
    safety -= 25;
  }

  return { pressure, safety };
}

function evaluateTactics(analysis, sideInfo, enemyInfo) {
  const board = analysis.state.board;
  const enemyColor = enemyInfo.color;
  const side = sideInfo.color;
  let score = 0;

  for (const enemyPiece of enemyInfo.pieces) {
    const attackers = attacksOnSquare(analysis, { r: enemyPiece.r, c: enemyPiece.c }, side);
    if (!attackers.count) continue;
    const defenders = attacksOnSquare(analysis, { r: enemyPiece.r, c: enemyPiece.c }, enemyColor);
    const net = attackers.weight - defenders.weight;
    if (net > 0) {
      score += Math.min(enemyPiece.value, net) * 0.12 + 6;
    }
    if (attackers.count >= 2 && enemyPiece.value >= PIECE_VALUES.R) {
      score += 10;
    }
  }

  for (const piece of sideInfo.pieces) {
    if (piece.type !== 'N' && piece.type !== 'B' && piece.type !== 'Q') continue;
    let highValueTargets = 0;
    if (piece.type === 'N') {
      for (const [dr, dc] of KNIGHT_OFFSETS) {
        const rr = piece.r + dr;
        const cc = piece.c + dc;
        if (rr < 0 || rr > 7 || cc < 0 || cc > 7) continue;
        const target = board[rr][cc];
        if (!target) continue;
        if (sideOfPiece(target) === enemyColor) {
          const value = PIECE_VALUES[target.toUpperCase()];
          if (value >= PIECE_VALUES.R) highValueTargets += 1;
        }
      }
      if (highValueTargets >= 2) score += 18 + highValueTargets * 4;
    } else {
      for (const [dr, dc] of KING_DIRS) {
        const rr = piece.r + dr;
        const cc = piece.c + dc;
        if (rr < 0 || rr > 7 || cc < 0 || cc > 7) continue;
        const target = board[rr][cc];
        if (!target) continue;
        if (sideOfPiece(target) === enemyColor) {
          const value = PIECE_VALUES[target.toUpperCase()];
          if (value >= PIECE_VALUES.R) highValueTargets += 1;
        }
      }
      if (highValueTargets >= 2) score += 10;
    }
  }

  if (enemyInfo.king && inCheck(analysis.state, enemyColor)) {
    score += 30;
  }

  return score;
}

function assessCoordination(analysis, sideInfo) {
  let coord = 0;
  for (const piece of sideInfo.pieces) {
    if (piece.type === 'P') continue;
    const defenders = attacksOnSquare(analysis, { r: piece.r, c: piece.c }, sideInfo.color);
    if (defenders.count) coord += defenders.count * 6;
    else coord -= 6;
  }
  return coord;
}

function evaluatePawnStructure(state, sideInfo, enemyInfo) {
  const board = state.board;
  let score = 0;
  for (let file = 0; file < 8; file += 1) {
    const friendly = sideInfo.pawnFiles[file];
    if (friendly > 1) score -= (friendly - 1) * 12;
    if (friendly > 0) {
      let isolated = true;
      if (file > 0 && sideInfo.pawnFiles[file - 1] > 0) isolated = false;
      if (file < 7 && sideInfo.pawnFiles[file + 1] > 0) isolated = false;
      if (isolated) score -= 10;
      else score += 4;
    }
    if (friendly === 0 && enemyInfo.pawnFiles[file] === 0) score += 2;
  }
  for (const pawn of sideInfo.pawns) {
    if (isPassedPawn(board, pawn.r, pawn.c, sideInfo.color)) {
      const advance = sideInfo.color === 'w' ? 6 - pawn.r : pawn.r - 1;
      score += 18 + advance * 6;
    }
    const dir = sideInfo.color === 'w' ? -1 : 1;
    const rr = pawn.r + dir;
    if (rr >= 0 && rr < 8) {
      const forward = pieceAt(board, rr, pawn.c);
      if (forward && sideOfPiece(forward) !== sideInfo.color) score -= 6;
    }
  }
  return score;
}

function evaluateCentralControl(analysis, sideInfo, enemyInfo) {
  const board = analysis.state.board;
  let score = 0;
  for (const square of CENTER_SQUARES) {
    const attacker = attacksOnSquare(analysis, square, sideInfo.color);
    const defender = attacksOnSquare(analysis, square, enemyInfo.color);
    if (attacker.count) score += attacker.weight * 0.12 + 6;
    score -= defender.count * 2;
    const piece = board[square.r][square.c];
    if (piece && sideOfPiece(piece) === sideInfo.color) score += 10;
  }
  for (const square of EXTENDED_CENTER) {
    const attacker = attacksOnSquare(analysis, square, sideInfo.color);
    if (attacker.count) score += attacker.weight * 0.05;
  }
  return score;
}

function evaluateOpenFiles(sideInfo, enemyInfo) {
  let score = 0;
  for (const piece of sideInfo.pieces) {
    if (piece.type !== 'R') continue;
    const file = piece.c;
    const friendly = sideInfo.pawnFiles[file];
    const enemy = enemyInfo.pawnFiles[file];
    if (friendly === 0) score += enemy === 0 ? 18 : 10;
  }
  return score;
}

function collectBoardInfo(state) {
  const white = {
    color: 'w',
    material: 0,
    mgPst: 0,
    egPst: 0,
    development: 0,
    mobility: 0,
    pawns: [],
    pawnFiles: Array(8).fill(0),
    king: null,
    pieces: [],
    hasCastled: false,
    phaseWeight: 1,
  };
  const black = {
    color: 'b',
    material: 0,
    mgPst: 0,
    egPst: 0,
    development: 0,
    mobility: 0,
    pawns: [],
    pawnFiles: Array(8).fill(0),
    king: null,
    pieces: [],
    hasCastled: false,
    phaseWeight: 1,
  };

  const { board } = state;
  let phaseScore = 0;

  for (let r = 0; r < 8; r += 1) {
    for (let c = 0; c < 8; c += 1) {
      const piece = board[r][c];
      if (!piece) continue;
      const type = piece.toUpperCase();
      const value = PIECE_VALUES[type] || 0;
      const idx = squareIndex(r, c);
      const side = piece === piece.toUpperCase() ? white : black;
      const mirror = mirrorIndex(idx);
      side.material += value;
      side.mgPst += PST_MG[type][piece === piece.toUpperCase() ? idx : mirror];
      side.egPst += PST_EG[type][piece === piece.toUpperCase() ? idx : mirror];
      side.pieces.push({ type, r, c, value });
      if (type === 'P') {
        side.pawns.push({ r, c });
        side.pawnFiles[c] += 1;
      }
      if (type === 'K') {
        side.king = { r, c };
        if (!isOnHomeSquare('K', side.color, r, c)) side.hasCastled = true;
      }
      if ((type === 'N' || type === 'B') && !isOnHomeSquare(type, side.color, r, c)) {
        side.development += 14;
      } else if ((type === 'N' || type === 'B') && side.phaseWeight > 0.6) {
        side.development -= 6;
      }
      if (type === 'R' && !isOnHomeSquare(type, side.color, r, c) && side.phaseWeight > 0.4) {
        side.development += 4;
      }
      if (type === 'Q' && !isOnHomeSquare(type, side.color, r, c) && side.phaseWeight > 0.5) {
        side.development += 3;
      }
      side.mobility += mobilityFrom(state, r, c, type, side.color);
      phaseScore += PIECE_PHASE[type];
    }
  }

  const phaseMax = 24;
  const mgWeight = Math.min(1, phaseScore / phaseMax);
  const egWeight = 1 - mgWeight;
  white.phaseWeight = mgWeight;
  black.phaseWeight = mgWeight;

  return { white, black, mgWeight, egWeight };
}

function evaluateWhitePerspective(state) {
  const { white, black, mgWeight, egWeight } = collectBoardInfo(state);
  const analysis = { state, attackCache: new Map() };

  const materialMg = (white.material + white.mgPst) - (black.material + black.mgPst);
  const materialEg = (white.material + white.egPst) - (black.material + black.egPst);

  const materialScore = materialMg * mgWeight + materialEg * egWeight;

  const developmentScore = (white.development - black.development) * (0.8 * mgWeight);
  const mobilityScore = (white.mobility - black.mobility) * 0.5;
  const pawnStructureScore =
    evaluatePawnStructure(state, white, black) - evaluatePawnStructure(state, black, white);
  const centralControlScore =
    evaluateCentralControl(analysis, white, black) - evaluateCentralControl(analysis, black, white);
  const openFileScore = evaluateOpenFiles(white, black) - evaluateOpenFiles(black, white);
  const coordinationScore = assessCoordination(analysis, white) - assessCoordination(analysis, black);

  const whiteKP = assessKingPressure(analysis, white, black);
  const blackKP = assessKingPressure(analysis, black, white);
  const kingSafetyScore = (whiteKP.safety - blackKP.safety) * (0.7 * mgWeight + 0.3);
  const attackPressureScore = (whiteKP.pressure - blackKP.pressure) * (1 + aggressionFactor * 0.7);

  const tacticalScore =
    evaluateTactics(analysis, white, black) - evaluateTactics(analysis, black, white);

  const passedPawnScale = 0.6 + egWeight * 0.6;
  const whitePassed = white.pawns.reduce(
    (acc, pawn) => (isPassedPawn(state.board, pawn.r, pawn.c, 'w') ? acc + 1 : acc),
    0,
  );
  const blackPassed = black.pawns.reduce(
    (acc, pawn) => (isPassedPawn(state.board, pawn.r, pawn.c, 'b') ? acc + 1 : acc),
    0,
  );
  const passedPawnScore = (whitePassed - blackPassed) * 22 * passedPawnScale;

  const initiative =
    (state.turn === 'w' ? 1 : -1) *
    ((whiteKP.pressure - blackKP.pressure) * 0.15 + (white.mobility - black.mobility) * 0.1);

  return (
    materialScore +
    developmentScore +
    mobilityScore +
    pawnStructureScore +
    centralControlScore +
    openFileScore +
    coordinationScore +
    kingSafetyScore +
    attackPressureScore +
    tacticalScore +
    passedPawnScore +
    initiative
  );
}

function evaluateForTurn(state, context) {
  const cache = context?.evalCache;
  const key = cache ? encodeStateKey(state) : null;
  if (key && cache.has(key)) return cache.get(key);
  const whiteScore = evaluateWhitePerspective(state);
  const score = state.turn === 'w' ? whiteScore : -whiteScore;
  if (key) cache.set(key, score);
  return score;
}

function moveToNotation(move) {
  if (!move) return '';
  const from = rcToAlgebra(move.from);
  const to = rcToAlgebra(move.to);
  const promo = move.promotion ? `=${move.promotion}` : '';
  return `${from}${to}${promo}`;
}

function moveKey(move) {
  return `${move.from.r}${move.from.c}-${move.to.r}${move.to.c}-${move.promotion || ''}`;
}

function createSearchContext(botSide, timeLimitMs) {
  const start = performance.now();
  return {
    botSide,
    startTime: start,
    deadline: timeLimitMs > 0 ? start + timeLimitMs : Infinity,
    history: new Map(),
    killers: Array.from({ length: 64 }, () => []),
    lastPvPost: 0,
    nodes: 0,
    stopped: false,
    evalCache: new Map(),
    rootBranching: 0,
  };
}

function shouldStop(context) {
  if (stopRequested) {
    context.stopped = true;
    return true;
  }
  if (performance.now() >= context.deadline) {
    context.stopped = true;
    return true;
  }
  return false;
}

function scoreMove(move, state, ply, context, principalKey) {
  let score = 0;
  if (principalKey && moveKey(move) === principalKey) score += 10000;
  if (move.capture) {
    const capturedValue = PIECE_VALUES[move.capture.toUpperCase()] || 0;
    const mover = pieceAt(state.board, move.from.r, move.from.c);
    const moverValue = mover ? PIECE_VALUES[mover.toUpperCase()] || 1 : 1;
    score += 5000 + capturedValue * 10 - moverValue;
  }
  if (move.promotion) score += 4000;
  const killers = context.killers[ply];
  if (killers) {
    if (killers[0] && moveKey(move) === killers[0]) score += 1200;
    if (killers[1] && moveKey(move) === killers[1]) score += 800;
  }
  const historyKey = `${state.turn}:${move.from.r}${move.from.c}-${move.to.r}${move.to.c}`;
  score += context.history.get(historyKey) || 0;
  return score;
}

function orderMoves(moves, state, ply, context, principalKey) {
  return moves
    .slice()
    .sort((a, b) => scoreMove(b, state, ply, context, principalKey) - scoreMove(a, state, ply, context, principalKey));
}

function updateKillers(context, ply, move) {
  const killers = context.killers[ply];
  if (!killers) return;
  const key = moveKey(move);
  if (killers[0] === key) return;
  killers.unshift(key);
  if (killers.length > MAX_KILLERS) killers.pop();
}

function updateHistory(context, state, move, depth) {
  const key = `${state.turn}:${move.from.r}${move.from.c}-${move.to.r}${move.to.c}`;
  const bonus = depth * depth;
  context.history.set(key, (context.history.get(key) || 0) + bonus);
}

function isHangingQueenMove(state, move) {
  if (move.capture || move.enPassant) return false;
  const piece = pieceAt(state.board, move.from.r, move.from.c);
  if (!piece || piece.toUpperCase() !== 'Q') return false;
  const side = sideOfPiece(piece);
  const next = cloneState(state);
  makeMove(next, move, { skipResult: true });
  const enemy = side === 'w' ? 'b' : 'w';
  const analysis = { state: next, attackCache: new Map() };
  const attackers = attacksOnSquare(analysis, move.to, enemy);
  if (!attackers.count) return false;
  const defenders = attacksOnSquare(analysis, move.to, side);
  if (defenders.count === 0 || attackers.weight > defenders.weight + PIECE_VALUES.Q * 0.5) return true;
  return false;
}

function quiescence(state, alpha, beta, depth, context) {
  if (shouldStop(context)) {
    return { score: evaluateForTurn(state, context), line: [], timedOut: true };
  }

  const standPat = evaluateForTurn(state, context);
  if (standPat >= beta) return { score: standPat, line: [] };
  let currentAlpha = alpha;
  if (standPat > currentAlpha) currentAlpha = standPat;

  const captures = generateLegalMoves(state).filter((m) => m.capture || m.enPassant || m.promotion);
  if (!captures.length) return { score: standPat, line: [] };

  const ordered = orderMoves(captures, state, depth, context, null);
  let bestScore = standPat;
  let bestLine = [];

  for (const move of ordered) {
    if (shouldStop(context)) return { score: bestScore, line: bestLine, timedOut: true };
    const next = cloneState(state);
    makeMove(next, move, { skipResult: true });
    const child = quiescence(next, -beta, -currentAlpha, depth + 1, context);
    if (child.timedOut) return { score: child.score, line: child.line, timedOut: true };
    const score = -child.score;
    if (score > bestScore) {
      bestScore = score;
      bestLine = [move, ...(child.line || [])];
    }
    if (score >= beta) {
      return { score, line: [move, ...(child.line || [])] };
    }
    if (score > currentAlpha) currentAlpha = score;
  }

  return { score: currentAlpha, line: bestLine };
}

function negamax(state, depth, alpha, beta, ply, context, principalKey) {
  if (shouldStop(context)) {
    return { score: evaluateForTurn(state, context), line: [], timedOut: true };
  }

  context.nodes += 1;

  if (depth === 0) {
    return quiescence(state, alpha, beta, ply, context);
  }

  const legal = generateLegalMoves(state);
  if (!legal.length) {
    if (inCheck(state, state.turn)) return { score: NEG_INF + ply, line: [] };
    return { score: 0, line: [] };
  }

  let bestMove = null;
  let bestLine = [];
  let bestScore = NEG_INF;

  const ordered = orderMoves(legal, state, ply, context, principalKey);

  for (const move of ordered) {
    if (shouldStop(context)) {
      return {
        score: bestScore !== NEG_INF ? bestScore : evaluateForTurn(state, context),
        line: bestLine,
        timedOut: true,
      };
    }
    if (ply > 0 && isHangingQueenMove(state, move)) continue;
    const nextState = cloneState(state);
    makeMove(nextState, move, { skipResult: true });
    const child = negamax(nextState, depth - 1, -beta, -alpha, ply + 1, context, null);
    if (child.timedOut) return { score: child.score, line: child.line, timedOut: true };
    const score = -child.score;
    if (score > bestScore) {
      bestScore = score;
      bestMove = move;
      bestLine = [move, ...(child.line || [])];
      if (ply === 0 && bestLine.length) {
        const now = performance.now();
        if (now - context.lastPvPost >= PV_UPDATE_INTERVAL_MS) {
          context.lastPvPost = now;
          const perspectiveScore = context.botSide === 'w' ? score : -score;
          self.postMessage({
            type: 'pv',
            depth,
            line: bestLine,
            currentMove: moveToNotation(bestLine[0]),
            lineNotation: bestLine.map(moveToNotation),
            score: perspectiveScore,
            elapsed: now - context.startTime,
          });
        }
      }
    }
    if (score > alpha) {
      alpha = score;
    }
    if (alpha >= beta) {
      if (!move.capture && !move.promotion) {
        updateKillers(context, ply, move);
        updateHistory(context, state, move, depth);
      }
      break;
    }
  }

  if (!bestMove) return { score: bestScore, line: bestLine };
  return { score: bestScore, move: bestMove, line: bestLine };
}

function fastEvaluate(state, perspective, weights) {
  const board = state.board;
  const enemy = perspective === 'w' ? 'b' : 'w';
  const pieceValues = {
    P: weights.pawnValue,
    N: weights.knightValue,
    B: weights.bishopValue,
    R: weights.rookValue,
    Q: weights.queenValue,
    K: 0,
  };

  let score = 0;
  const myPieces = [];
  const enemyPieces = [];
  const myPawns = [];
  const enemyPawns = [];
  const myRooks = [];
  const enemyRooks = [];
  const myKnights = [];
  const enemyKnights = [];
  const myBishops = [];
  const enemyBishops = [];
  let myQueen = null;
  let enemyQueen = null;
  let myQueenMoved = false;
  let enemyQueenMoved = false;
  const myPawnBoard = Array.from({ length: 8 }, () => Array(8).fill(false));
  const enemyPawnBoard = Array.from({ length: 8 }, () => Array(8).fill(false));
  let myKingPos = null;
  let enemyKingPos = null;
  let myMobility = 0;
  let enemyMobility = 0;

  for (let r = 0; r < 8; r += 1) {
    for (let c = 0; c < 8; c += 1) {
      const piece = board[r][c];
      if (!piece) continue;
      const type = piece.toUpperCase();
      const side = piece === piece.toUpperCase() ? 'w' : 'b';
      const entry = { type, r, c };
      const value = pieceValues[type] || 0;
      const mobility = pieceMobility(board, entry, side);
      if (side === perspective) {
        score += value;
        myMobility += mobility;
        myPieces.push(entry);
        if (type === 'P') {
          myPawns.push(entry);
          myPawnBoard[r][c] = true;
        } else if (type === 'R') {
          myRooks.push(entry);
        } else if (type === 'N') {
          myKnights.push(entry);
        } else if (type === 'B') {
          myBishops.push(entry);
        } else if (type === 'Q') {
          myQueen = entry;
          if (!((perspective === 'w' && r === 7 && c === 3) || (perspective === 'b' && r === 0 && c === 3))) {
            myQueenMoved = true;
          }
        } else if (type === 'K') {
          myKingPos = { r, c };
        }
      } else {
        score -= value;
        enemyMobility += mobility;
        enemyPieces.push(entry);
        if (type === 'P') {
          enemyPawns.push(entry);
          enemyPawnBoard[r][c] = true;
        } else if (type === 'R') {
          enemyRooks.push(entry);
        } else if (type === 'N') {
          enemyKnights.push(entry);
        } else if (type === 'B') {
          enemyBishops.push(entry);
        } else if (type === 'Q') {
          enemyQueen = entry;
          if (!((enemy === 'w' && r === 7 && c === 3) || (enemy === 'b' && r === 0 && c === 3))) {
            enemyQueenMoved = true;
          }
        } else if (type === 'K') {
          enemyKingPos = { r, c };
        }
      }
    }
  }

  if (inCheck(state, perspective)) score += weights.checkPenalty;
  if (inCheck(state, enemy)) score -= weights.checkPenalty;

  if (isCastled(myKingPos, perspective)) score += weights.castleBonus;
  if (isCastled(enemyKingPos, enemy)) score -= weights.castleBonus;

  const myPawnStats = computePawnStats(myPawns, perspective, enemyPawnBoard);
  const enemyPawnStats = computePawnStats(enemyPawns, enemy, myPawnBoard);

  score += weights.isolatedPenalty * (myPawnStats.isolated - enemyPawnStats.isolated);
  score += weights.doubledPenalty * (myPawnStats.doubled - enemyPawnStats.doubled);
  score += weights.passedBonus * (myPawnStats.passed - enemyPawnStats.passed);
  score += weights.passedRankBonus * (myPawnStats.passedAdvance - enemyPawnStats.passedAdvance);

  score += weights.mobilityBonus * (myMobility - enemyMobility);
  const myKnightCenter = countKnightsInCenter(myKnights);
  const enemyKnightCenter = countKnightsInCenter(enemyKnights);
  score += weights.knightCenterBonus * (myKnightCenter - enemyKnightCenter);

  const myBishopReach = totalBishopReach(board, myBishops);
  const enemyBishopReach = totalBishopReach(board, enemyBishops);
  score += weights.bishopActivityBonus * ((myBishopReach - enemyBishopReach) / 4);

  const myRookOpen = rookFileScore(myRooks, myPawnStats.files, enemyPawnStats.files);
  const enemyRookOpen = rookFileScore(enemyRooks, enemyPawnStats.files, myPawnStats.files);
  score += weights.rookOpenBonus * (myRookOpen - enemyRookOpen);

  if (state.fullmove <= 10) {
    if (myQueen && myQueenMoved) score += weights.queenEarlyPenalty;
    if (enemyQueen && enemyQueenMoved) score -= weights.queenEarlyPenalty;
  }

  return score;
}

function runFastMove(initialState, side, timeLimitMs, weights) {
  const moves = generateLegalMoves(initialState);
  const start = performance.now();
  const deadline = timeLimitMs > 0 ? start + timeLimitMs : Infinity;

  if (!moves.length) {
    self.postMessage({
      type: 'result',
      move: null,
      line: [],
      moveNotation: '',
      lineNotation: [],
      score: 0,
      elapsed: 0,
    });
    return;
  }

  let bestMove = null;
  let bestScore = -Infinity;
  let bestGain = -Infinity;
  const baseline = fastEvaluate(initialState, side, weights);

  for (const move of moves) {
    if (stopRequested) break;
    if (timeLimitMs > 0 && performance.now() > deadline) break;
    const nextState = cloneState(initialState);
    makeMove(nextState, move, { skipResult: true });
    const score = fastEvaluate(nextState, side, weights);
    const gain = score - baseline;
    if (!bestMove || gain > bestGain || (gain === bestGain && score > bestScore)) {
      bestMove = move;
      bestScore = score;
      bestGain = gain;
    }
  }

  if (!bestMove) {
    bestMove = moves[0];
    const fallbackState = cloneState(initialState);
    makeMove(fallbackState, bestMove, { skipResult: true });
    bestScore = fastEvaluate(fallbackState, side, weights);
    bestGain = bestScore - baseline;
  }

  self.postMessage({
    type: 'result',
    move: bestMove,
    line: bestMove ? [bestMove] : [],
    moveNotation: moveToNotation(bestMove),
    lineNotation: bestMove ? [moveToNotation(bestMove)] : [],
    score: bestGain,
    elapsed: performance.now() - start,
  });
}

function runSearch(initialState, side, depthLimit, timeLimitMs) {
  const context = createSearchContext(side, timeLimitMs);
  const rootMoves = generateLegalMoves(initialState);
  context.rootBranching = rootMoves.length;

  let adjustedDepth = Math.max(1, depthLimit);
  if (rootMoves.length >= 32) adjustedDepth = Math.max(2, adjustedDepth - 1);
  if (rootMoves.length >= 44) adjustedDepth = Math.max(1, adjustedDepth - 1);
  if (timeLimitMs > 0) {
    if (timeLimitMs < 4000) adjustedDepth = Math.min(adjustedDepth, 2);
    if (timeLimitMs < 2500) adjustedDepth = Math.min(adjustedDepth, 1);
  }
  if (rootMoves.length <= 14 && timeLimitMs > 6000 && adjustedDepth < depthLimit) {
    adjustedDepth = Math.min(depthLimit, adjustedDepth + 1);
  }
  const maxDepth = Math.max(1, adjustedDepth);

  let bestMove = null;
  let bestLine = [];
  let bestScore = evaluateForTurn(initialState, context);

  let currentDepth = 1;
  while (currentDepth <= maxDepth) {
    if (context.stopped) break;
    const searchState = cloneState(initialState);
    const principalKey = bestLine.length ? moveKey(bestLine[0]) : null;
    const result = negamax(searchState, currentDepth, NEG_INF, POS_INF, 0, context, principalKey);
    if (result.move) {
      bestMove = result.move;
      bestLine = result.line && result.line.length ? result.line : [result.move];
      bestScore = result.score;
    }
    const now = performance.now();
    self.postMessage({
      type: 'pv',
      depth: currentDepth,
      line: bestLine,
      currentMove: bestLine.length ? moveToNotation(bestLine[0]) : '',
      lineNotation: bestLine.map(moveToNotation),
      score: side === 'w' ? bestScore : -bestScore,
      elapsed: now - context.startTime,
    });
    if (result.timedOut || context.stopped) break;
    currentDepth += 1;
  }

  const elapsed = performance.now() - context.startTime;
  return {
    move: bestMove,
    line: bestLine,
    score: side === 'w' ? bestScore : -bestScore,
    elapsed,
  };
}

function reportError(err) {
  self.postMessage({
    type: 'error',
    message: err?.message || String(err),
    stack: err?.stack || null,
  });
}

self.addEventListener('message', (event) => {
  const { data } = event;
  if (!data) return;
  if (data.type === 'stop') {
    stopRequested = true;
    return;
  }
  if (data.type !== 'analyze') return;

  try {
    const {
      state,
      side,
      mode = 'strategic',
      depth = 3,
      timeLimitMs = 10000,
      sacrificeBias = 0.25,
      fastWeights = null,
    } = data;

    stopRequested = false;
    aggressionFactor = clamp01(sacrificeBias);

    const weightConfig = sanitizeFastWeights(fastWeights);

    if (mode === 'fast') {
      const fastState = cloneState(state);
      runFastMove(fastState, side, Math.max(0, timeLimitMs), weightConfig);
      return;
    }

    const searchState = cloneState(state);
    const result = runSearch(searchState, side, Math.max(1, depth), Math.max(0, timeLimitMs));
    self.postMessage({
      type: 'result',
      move: result.move,
      line: result.line,
      moveNotation: moveToNotation(result.move),
      lineNotation: result.line.map(moveToNotation),
      score: result.score,
      elapsed: result.elapsed,
    });
  } catch (err) {
    reportError(err);
  }
});
