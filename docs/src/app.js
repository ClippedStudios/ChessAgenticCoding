import { createBoardUI } from './ui/board.js';
import { createGame } from './chess/game.js';
import { Bot } from './engine/bot.js';

const BOT_DEPTH = 2;
const BOT_MOVE_TIME_MS = 650;

function init() {
  const boardEl = document.getElementById('board');
  const statusEl = document.getElementById('status');
  const movesEl = document.getElementById('moves');
  const dlg = document.getElementById('newGameDialog');
  const newGameBtn = document.getElementById('newGameBtn');
  const startGameBtn = document.getElementById('startGameBtn');
  const resignBtn = document.getElementById('resignBtn');
  const form = document.getElementById('newGameForm');

  if (!boardEl || !statusEl || !movesEl || !dlg || !newGameBtn || !startGameBtn || !resignBtn || !form) {
    console.error('Chess UI initialisation failed: missing required elements.');
    return;
  }

  let ui;
  let game;
  let bot;
  let playerSide = 'w';
  let botThinking = false;

  function setStatus(text) {
    statusEl.textContent = text;
  }

  function appendMoveSAN(san) {
    const div = document.createElement('div');
    div.textContent = san;
    movesEl.appendChild(div);
    movesEl.scrollTop = movesEl.scrollHeight;
  }

  async function maybeBotMove() {
    if (!bot || botThinking || game.isGameOver()) return;
    if (game.state.turn === playerSide) return;

    botThinking = true;
    setStatus('Bot thinking...');

    try {
      const sideMs = game.state.turn === 'w' ? game.state.whiteMs : game.state.blackMs;
      const timeBudget = Math.max(300, Math.min(BOT_MOVE_TIME_MS, sideMs || BOT_MOVE_TIME_MS));
      const move = await bot.chooseMove(game, BOT_DEPTH, timeBudget);
      if (move) {
        const result = game.playMove(move);
        ui.render(game);
        appendMoveSAN(result.san);
      }
      checkResult();
    } catch (err) {
      console.error('Bot move failed', err);
      game.state.result = { outcome: 'error', message: 'Bot failed to move' };
      setStatus('Bot move failed - you win by error');
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
    } else {
      setStatus(game.state.turn === 'w' ? 'White to move' : 'Black to move');
    }
  }

  function startNewGame({ side }) {
    if (bot) bot.dispose();

    playerSide = side;
    botThinking = false;

    game = createGame();
    bot = new Bot(playerSide === 'w' ? 'b' : 'w');

    ui = createBoardUI(boardEl, game, {
      onUserMove: (move) => {
        if (botThinking || game.state.turn !== playerSide) return;
        const result = game.playMove(move);
        if (!result) return;
        ui.render(game);
        appendMoveSAN(result.san);
        checkResult();
        maybeBotMove();
      },
    });

    ui.setPerspective(playerSide);
    ui.setPlayerSide(playerSide);
    ui.render(game);

    movesEl.innerHTML = '';
    setStatus(playerSide === 'w' ? 'White to move' : 'Black to move');
    dlg.close();

    maybeBotMove();
  }

  newGameBtn.addEventListener('click', () => dlg.showModal());

  startGameBtn.addEventListener('click', (event) => {
    event.preventDefault();
    const sideInput = form.elements.namedItem('side');
    const side = sideInput ? sideInput.value : 'w';
    startNewGame({ side: side || 'w' });
  });

  resignBtn.addEventListener('click', () => {
    if (!game || game.isGameOver()) return;
    const loser = playerSide === 'w' ? 'White' : 'Black';
    game.state.result = { outcome: 'resign', message: `${loser} resigns` };
    ui.render(game);
    setStatus(game.state.result.message);
  });

  dlg.showModal();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
