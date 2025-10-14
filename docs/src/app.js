import { createBoardUI } from './ui/board.js';
import { createTimer } from './ui/timer.js';
import { createGame } from './chess/game.js';
import { Bot } from './engine/bot.js';

const boardEl = document.getElementById('board');
const statusEl = document.getElementById('status');
const movesEl = document.getElementById('moves');
const dlg = document.getElementById('newGameDialog');
const newGameBtn = document.getElementById('newGameBtn');
const startGameBtn = document.getElementById('startGameBtn');
const pauseBtn = document.getElementById('pauseBtn');
const resumeBtn = document.getElementById('resumeBtn');
const resignBtn = document.getElementById('resignBtn');

const whiteClockEl = document.getElementById('whiteClock');
const blackClockEl = document.getElementById('blackClock');
const whiteClockPanel = document.querySelector('.clock.white');
const blackClockPanel = document.querySelector('.clock.black');

const BOT_DEPTH = 2;
const BOT_MOVE_TIME_MS = 650;

let ui;
let timer;
let game;
let bot;
let playerSide = 'w';
let increment = 0;
let botThinking = false;

function openNewGameDialog() {
  dlg.showModal();
}

function formatMs(ms) {
  const neg = ms < 0;
  const abs = Math.max(0, Math.floor(Math.abs(ms) / 1000));
  const minutes = Math.floor(abs / 60);
  const seconds = abs % 60;
  const pad = (n) => n.toString().padStart(2, '0');
  return `${neg ? '-' : ''}${pad(minutes)}:${pad(seconds)}`;
}

function updateClocks() {
  const { whiteMs, blackMs, turn } = game.state;
  whiteClockEl.textContent = formatMs(whiteMs);
  blackClockEl.textContent = formatMs(blackMs);
  whiteClockPanel.classList.toggle('active', turn === 'w');
  blackClockPanel.classList.toggle('active', turn === 'b');
  whiteClockPanel.classList.toggle('low', whiteMs <= 10_000);
  blackClockPanel.classList.toggle('low', blackMs <= 10_000);
}

function setStatus(text) {
  statusEl.textContent = text;
}

function appendMoveSAN(san) {
  const div = document.createElement('div');
  div.textContent = san;
  movesEl.appendChild(div);
  movesEl.scrollTop = movesEl.scrollHeight;
}

function onMoveMade(move) {
  if (!move) return;
  if (increment > 0) {
    if (move.color === 'w') game.state.whiteMs += increment * 1000;
    else game.state.blackMs += increment * 1000;
  }
  timer.switchTurn(game.state.turn);
  updateClocks();
  appendMoveSAN(move.san);
}

async function maybeBotMove() {
  if (!bot || botThinking || game.isGameOver()) return;
  if (game.state.turn === playerSide) return;

  botThinking = true;
  setStatus('Bot thinking...');

  try {
    const depth = BOT_DEPTH;
    const sideMs = game.state.turn === 'w' ? game.state.whiteMs : game.state.blackMs;
    const timeBudget = Math.max(300, Math.min(BOT_MOVE_TIME_MS, sideMs || BOT_MOVE_TIME_MS));
    const move = await bot.chooseMove(game, depth, timeBudget);

    if (move) {
      const result = game.playMove(move);
      ui.render(game);
      onMoveMade(result);
      checkResult();
    } else {
      checkResult();
    }
  } catch (err) {
    console.error('Bot move failed', err);
    game.state.result = { outcome: 'error', message: 'Bot failed to move' };
    setStatus('Bot move failed - you win by error');
    timer.stop();
  } finally {
    botThinking = false;
    if (!game.getResult()) {
      setStatus(game.state.turn === 'w' ? 'White to move' : 'Black to move');
    }
  }
}

function checkResult() {
  const res = game.getResult();
  if (res) {
    setStatus(res.message);
    timer.stop();
    pauseBtn.disabled = true;
    resumeBtn.disabled = true;
  } else {
    setStatus(game.state.turn === 'w' ? 'White to move' : 'Black to move');
  }
}

function startNewGame({ side, minutes, inc }) {
  if (timer) timer.stop();
  if (bot) bot.dispose();

  playerSide = side;
  increment = inc;
  botThinking = false;

  game = createGame({ minutes, increment: inc });
  bot = new Bot(playerSide === 'w' ? 'b' : 'w');

  ui = createBoardUI(boardEl, game, {
    onUserMove: (move) => {
      if (botThinking || game.state.turn !== playerSide) return;
      const result = game.playMove(move);
      if (!result) return;
      ui.render(game);
      onMoveMade(result);
      checkResult();
      maybeBotMove();
    },
  });

  ui.setPerspective(playerSide);
  ui.setPlayerSide(playerSide);
  ui.render(game);

  movesEl.innerHTML = '';
  setStatus(playerSide === 'w' ? 'White to move' : 'Black to move');

  timer = createTimer({
    onTick: (side, deltaMs) => {
      if (side === 'w') game.state.whiteMs -= deltaMs;
      else game.state.blackMs -= deltaMs;

      if (game.state.whiteMs < 0) game.state.whiteMs = 0;
      if (game.state.blackMs < 0) game.state.blackMs = 0;

      updateClocks();

      if (game.state.whiteMs <= 0 || game.state.blackMs <= 0) {
        const loser = game.state.whiteMs <= 0 ? 'White' : 'Black';
        game.state.result = { outcome: 'time', message: `${loser} loses on time` };
        checkResult();
      }
    },
  });

  timer.start(game.state.turn);
  pauseBtn.disabled = false;
  resumeBtn.disabled = true;
  updateClocks();
  dlg.close();

  maybeBotMove();
}

newGameBtn.addEventListener('click', openNewGameDialog);

startGameBtn.addEventListener('click', () => {
  const form = document.getElementById('newGameForm');
  const side = form.side.value;
  const minutes = parseInt(form.minutes.value || '10', 10);
  const inc = parseInt(form.increment.value || '0', 10);
  startNewGame({ side, minutes, inc });
});

pauseBtn.addEventListener('click', () => {
  if (!timer) return;
  timer.pause();
  pauseBtn.disabled = true;
  resumeBtn.disabled = false;
});

resumeBtn.addEventListener('click', () => {
  if (!timer) return;
  timer.resume();
  pauseBtn.disabled = false;
  resumeBtn.disabled = true;
});

resignBtn.addEventListener('click', () => {
  if (!game || game.isGameOver()) return;
  const loser = playerSide === 'w' ? 'White' : 'Black';
  game.state.result = { outcome: 'resign', message: `${loser} resigns` };
  timer.stop();
  ui.render(game);
  checkResult();
});

openNewGameDialog();

