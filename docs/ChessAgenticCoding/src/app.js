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

let ui, timer, game, bot;
let playerSide = 'w';
let increment = 0;
let isPaused = false;

function openNewGameDialog() {
  dlg.showModal();
}

function formatMs(ms) {
  const neg = ms < 0; if (neg) ms = -ms;
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  const pad = (n) => n.toString().padStart(2, '0');
  return `${neg ? '-' : ''}${pad(m)}:${pad(r)}`;
}

function updateClocks() {
  const wc = game.state.whiteMs;
  const bc = game.state.blackMs;
  whiteClockEl.textContent = formatMs(wc);
  blackClockEl.textContent = formatMs(bc);
  document.querySelector('.clock.white').classList.toggle('active', game.state.turn === 'w');
  document.querySelector('.clock.black').classList.toggle('active', game.state.turn === 'b');
  document.querySelector('.clock.white').classList.toggle('low', wc <= 10000);
  document.querySelector('.clock.black').classList.toggle('low', bc <= 10000);
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
  // Switch clock and add increment to the side that just moved
  if (increment > 0) {
    if (move.color === 'w') game.state.whiteMs += increment * 1000; else game.state.blackMs += increment * 1000;
  }
  timer.switchTurn(game.state.turn);
  updateClocks();
  appendMoveSAN(move.san);
}

function maybeBotMove() {
  if (game.isGameOver()) return;
  if (game.state.turn !== playerSide) {
    // Let the UI update first
    setTimeout(() => {
      const depth = 2; // Keep it quick
      const move = bot.chooseMove(game, depth, 1200);
      if (move) {
        const result = game.playMove(move);
        ui.render(game);
        onMoveMade(result);
        checkResult();
      }
    }, 50);
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
  playerSide = side;
  increment = inc;
  game = createGame({ minutes, increment: inc });
  bot = new Bot('w' === side ? 'b' : 'w');
  ui = createBoardUI(boardEl, game, {
    onUserMove: (move) => {
      if (game.state.turn !== playerSide) return;
      const result = game.playMove(move);
      if (!result) return; // illegal
      ui.render(game);
      onMoveMade(result);
      checkResult();
      maybeBotMove();
    }
  });
  ui.setPerspective(playerSide);
  ui.render(game);
  movesEl.innerHTML = '';
  setStatus(side === 'w' ? 'White to move' : 'Black to move');
  timer = createTimer({
    onTick: () => {
      const now = Date.now();
      if (game.state.turn === 'w') game.state.whiteMs -= 100; else game.state.blackMs -= 100;
      updateClocks();
      if (game.state.whiteMs <= 0 || game.state.blackMs <= 0) {
        const loser = game.state.whiteMs <= 0 ? 'White' : 'Black';
        game.state.result = { outcome: 'time', message: `${loser} loses on time` };
        checkResult();
      }
    }
  });
  timer.start(game.state.turn);
  pauseBtn.disabled = false;
  resumeBtn.disabled = true;
  updateClocks();
  dlg.close();
  if (game.state.turn !== playerSide) maybeBotMove();
}

newGameBtn.addEventListener('click', openNewGameDialog);
startGameBtn.addEventListener('click', (e) => {
  const form = document.getElementById('newGameForm');
  const side = form.side.value;
  const minutes = parseInt(form.minutes.value || '10', 10);
  const inc = parseInt(form.increment.value || '0', 10);
  startNewGame({ side, minutes, inc });
});

pauseBtn.addEventListener('click', () => {
  timer.pause();
  isPaused = true;
  pauseBtn.disabled = true;
  resumeBtn.disabled = false;
});
resumeBtn.addEventListener('click', () => {
  timer.resume();
  isPaused = false;
  pauseBtn.disabled = false;
  resumeBtn.disabled = true;
});
resignBtn.addEventListener('click', () => {
  if (!game) return;
  const loser = playerSide === 'w' ? 'White' : 'Black';
  game.state.result = { outcome: 'resign', message: `${loser} resigns` };
  ui.render(game);
  checkResult();
});

// Show new game dialog on first load
openNewGameDialog();

