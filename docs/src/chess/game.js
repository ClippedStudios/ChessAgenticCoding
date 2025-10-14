import { STANDARD_START_FEN, parseFEN, generateLegalMoves, makeMove, inCheck, toSAN } from './rules.js';

export function createGame({ minutes = 10, increment = 0 } = {}) {
  const start = parseFEN(STANDARD_START_FEN);
  const state = {
    ...start,
    whiteMs: minutes * 60 * 1000,
    blackMs: minutes * 60 * 1000,
    increment,
    result: null,
    lastMove: null,
    history: [], // for repetition or undo later
  };

  function playMove(move) {
    const legal = generateLegalMoves(state);
    const found = legal.find(m => m.from.r===move.from.r && m.from.c===move.from.c && m.to.r===move.to.r && m.to.c===move.to.c && (m.promotion||'') === (move.promotion||''));
    if (!found) return null;
    const prev = JSON.parse(JSON.stringify(state));
    makeMove(state, found);
    state.lastMove = found;
    state.history.push(prev);
    found.san = toSAN(prev, found);
    found.color = prev.turn;
    return found;
  }

  function isGameOver() { return !!state.result; }
  function getResult() { return state.result; }

  return { state, playMove, isGameOver, getResult };
}
