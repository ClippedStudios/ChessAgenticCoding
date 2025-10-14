import { createBoardUI } from './ui/board.js';
import { createGame } from './chess/game.js';
import { Bot } from './engine/bot.js';
import { cloneState } from './chess/rules.js';
import { createAnalysisDisplay } from './ui/analysisBoard.js';

const BOT_DEPTH = 2;
const BOT_MOVE_TIME_MS = 10_000;

function init() {
  const boardEl = document.getElementById('board');
  const statusEl = document.getElementById('status');
  const movesEl = document.getElementById('moves');
  const dlg = document.getElementById('newGameDialog');
  const newGameBtn = document.getElementById('newGameBtn');
  const startGameBtn = document.getElementById('startGameBtn');
  const resignBtn = document.getElementById('resignBtn');
  const form = document.getElementById('newGameForm');
  const analysisRoot = document.getElementById('analysisBoard');
  const analysisInfo = document.getElementById('analysisInfo');

  if (!boardEl || !statusEl || !movesEl || !dlg || !newGameBtn || !startGameBtn || !resignBtn || !form || !analysisRoot || !analysisInfo) {
    console.error('Chess UI initialisation failed: missing required elements.');
    return;
  }

  let ui;
  let game;
  let bot;
  let playerSide = 'w';
  let botThinking = false;
  const analysisDisplay = createAnalysisDisplay(analysisRoot, analysisInfo, { frameDelay: 400, holdMs: 260, maxQueue: 10 });

  const setStatus = (text) => {
    statusEl.textContent = text;
  };

  const appendMoveSAN = (san) => {
    const div = document.createElement('div');
    div.textContent = san;
    movesEl.appendChild(div);
    movesEl.scrollTop = movesEl.scrollHeight;
  };

  const formatEval = (score, side) => {
    const sign = side === 'w' ? 1 : -1;
    const value = (score / 100) * sign;
    return `${value >= 0 ? '+' : ''}${value.toFixed(2)}`;
  };

  const maybeBotMove = async () => {
    if (!bot || botThinking || game.isGameOver()) return;
    if (game.state.turn === playerSide) return;

    botThinking = true;
    setStatus('Bot thinking...');
    const baseState = cloneState(game.state);
    analysisDisplay.clear({ infoText: 'Exploring moves...' });
    let guessCount = 0;

    try {
      const sideMs = game.state.turn === 'w' ? game.state.whiteMs : game.state.blackMs;
      const timeBudget = Math.max(300, Math.min(BOT_MOVE_TIME_MS, sideMs || BOT_MOVE_TIME_MS));
      const move = await bot.chooseMove(game, BOT_DEPTH, timeBudget, (payload) => {
        if (!payload) return;
        const { line = [], depth, score } = payload;
        guessCount += 1;
        const infoText = `Guess #${guessCount} depth ${depth} eval ${formatEval(score, bot.side)}`;
        analysisDisplay.queueLine(baseState, line, { infoText });
      });

      if (move) {
        const result = game.playMove(move);
        ui.render(game);
        appendMoveSAN(result.san);
      }
    } catch (err) {
      console.error('Bot move failed', err);
      game.state.result = { outcome: 'error', message: 'Bot failed to move' };
      setStatus('Bot move failed - you win by error');
      analysisDisplay.clear({ infoText: 'Bot encountered an error.' });
    } finally {
      botThinking = false;
      if (!game.getResult()) {
        setStatus(game.state.turn === 'w' ? 'White to move' : 'Black to move');
      }
      if (game) {
        analysisDisplay.showPosition(cloneState(game.state), {
          infoText: game.getResult() ? 'Bot finished.' : 'Ready for your move.',
        });
      }
      checkResult();
    }
  };

  const checkResult = () => {
    const res = game.getResult();
    if (res) {
      setStatus(res.message);
    } else {
      setStatus(game.state.turn === 'w' ? 'White to move' : 'Black to move');
    }
  };

  const startNewGame = ({ side }) => {
    if (bot) bot.dispose();

    playerSide = side;
    botThinking = false;

    game = createGame();
    bot = new Bot(playerSide === 'w' ? 'b' : 'w');

    ui = createBoardUI(boardEl, game, {
      onUserMove: (move) => {
        if (botThinking || game.state.turn !== playerSide) return;
        analysisDisplay.clear({ infoText: 'Player exploring...' });
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
    analysisDisplay.showPosition(cloneState(game.state), { infoText: 'Waiting for bot...' });
    dlg.close();

    maybeBotMove();
  };

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
