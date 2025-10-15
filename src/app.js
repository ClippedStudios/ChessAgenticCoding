import { createBoardUI } from './ui/board.js';
import { createGame } from './chess/game.js';
import { Bot } from './engine/bot.js';
import { cloneState } from './chess/rules.js';
import { createAnalysisDisplay } from './ui/analysisBoard.js';

const BOT_DEPTH = 2;
const BOT_MOVE_TIME_MS = 10000;
const DEFAULT_SAMPLE_SECONDS = 6;

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
  let botModeSetting = 'search';
  let botBudgetMs = BOT_MOVE_TIME_MS;
  let botAggression = 0.25;
  const analysisDisplay = createAnalysisDisplay(analysisRoot, analysisInfo, { frameDelay: 320 });

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

  const checkResult = () => {
    const res = game.getResult();
    if (res) {
      setStatus(res.message);
    } else {
      setStatus(game.state.turn === 'w' ? 'White to move' : 'Black to move');
    }
  };

  const maybeBotMove = async () => {
    if (!bot || botThinking || game.isGameOver()) return;
    if (game.state.turn === playerSide) return;

    botThinking = true;
    const mode = botModeSetting;
    setStatus(mode === 'random' ? 'Bot experimenting with ideas...' : 'Bot thinking...');
    const baseState = cloneState(game.state);
    analysisDisplay.showPosition(baseState, { infoText: 'Exploring moves...' });
    let updateCount = 0;

    const handleUpdate = (payload) => {
      if (!payload) return;
      if (payload.type === 'sample') {
        const sampleIndex = payload.samples ?? (updateCount += 1);
        const moveLabel = payload.moveNotation ? ` ${payload.moveNotation}` : '';
        const infoText = `Sample #${sampleIndex}${moveLabel} eval ${formatEval(payload.score, bot.side)}`;
        analysisDisplay.queueLine(baseState, payload.line || [], { infoText });
        return;
      }
      if (payload.type === 'pv') {
        updateCount += 1;
        const moveLabel = payload.currentMove ? ` ${payload.currentMove}` : '';
        const infoText = `Guess #${updateCount} depth ${payload.depth}${moveLabel} eval ${formatEval(payload.score, bot.side)}`;
        analysisDisplay.queueLine(baseState, payload.line || [], { infoText });
      }
    };

    try {
      const sideMs = game.state.turn === 'w' ? game.state.whiteMs : game.state.blackMs;
      const minBudget = mode === 'random' ? 200 : 500;
      const targetBudget = Math.max(minBudget, botBudgetMs);
      const timeBudget = Math.max(minBudget, Math.min(targetBudget, sideMs || targetBudget));
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const move = await bot.chooseMove(game, {
        mode,
        depth: BOT_DEPTH,
        timeMs: timeBudget,
        sampleWindowMs: timeBudget,
        sacrificeBias: botAggression,
        onUpdate: handleUpdate,
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

  const startNewGame = ({ side, mode, sampleSeconds, sacrificeValue }) => {
    if (bot) bot.dispose();

    playerSide = side;
    botModeSetting = mode;
    const seconds = Number.isFinite(sampleSeconds) ? sampleSeconds : DEFAULT_SAMPLE_SECONDS;
    botBudgetMs = Math.max(1, Math.min(30, seconds)) * 1000;
    botAggression = Math.max(0, Math.min(1, (sacrificeValue ?? 25) / 100));
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

  const sacrificeSlider = form.elements.namedItem('sacrificeBias');
  const sacrificeLabel = document.getElementById('sacrificeLabel');

  const describeAggression = (value) => {
    if (value <= 5) return 'None';
    if (value <= 20) return 'Light';
    if (value <= 45) return 'Moderate';
    if (value <= 70) return 'Bold';
    return 'Reckless';
  };

  if (sacrificeSlider && sacrificeLabel) {
    const syncLabel = () => {
      const value = Number.parseInt(sacrificeSlider.value, 10) || 0;
      sacrificeLabel.textContent = describeAggression(value);
    };
    sacrificeSlider.addEventListener('input', syncLabel);
    syncLabel();
  }

  newGameBtn.addEventListener('click', () => dlg.showModal());

  startGameBtn.addEventListener('click', (event) => {
    event.preventDefault();
    const sideInput = form.elements.namedItem('side');
    const side = sideInput ? sideInput.value : 'w';
    const modeInput = form.elements.namedItem('botMode');
    const mode = modeInput ? modeInput.value : 'search';
    const secondsInput = form.elements.namedItem('sampleSeconds');
    const sampleSeconds = secondsInput ? parseFloat(secondsInput.value) : DEFAULT_SAMPLE_SECONDS;
    const sacrificeInput = form.elements.namedItem('sacrificeBias');
    const sacrificeValue = sacrificeInput ? parseFloat(sacrificeInput.value) : 25;
    startNewGame({ side: side || 'w', mode, sampleSeconds, sacrificeValue });
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

