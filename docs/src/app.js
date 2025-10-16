import { createBoardUI } from './ui/board.js';
import { createGame } from './chess/game.js';
import { Bot } from './engine/bot.js';
import { cloneState } from './chess/rules.js';
import { createAnalysisDisplay } from './ui/analysisBoard.js';

const BOT_MOVE_TIME_MS = 10000;
const DEFAULT_THINK_SECONDS = 6;
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
const FAST_WEIGHT_LIMIT = 5000;

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
  const analysisTimerEl = document.getElementById('analysisTimerLabel');

  if (!boardEl || !statusEl || !movesEl || !dlg || !newGameBtn || !startGameBtn || !resignBtn || !form || !analysisRoot || !analysisInfo) {
    console.error('Chess UI initialisation failed: missing required elements.');
    return;
  }

  let ui;
  let game;
  let bot;
  let playerSide = 'w';
  let botThinking = false;
  let botBudgetMs = BOT_MOVE_TIME_MS;
  let botFastWeights = { ...DEFAULT_FAST_WEIGHTS };
  const analysisDisplay = createAnalysisDisplay(analysisRoot, analysisInfo, { frameDelay: 320 });
  let analysisTimerInterval = null;
  let analysisTimerDeadline = null;

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

  const stopAnalysisTimer = (forceZero = false) => {
    if (analysisTimerInterval) {
      clearInterval(analysisTimerInterval);
      analysisTimerInterval = null;
    }
    analysisTimerDeadline = null;
    if (!analysisTimerEl) return;
    if (forceZero) analysisTimerEl.textContent = '0.0s';
    else analysisTimerEl.textContent = '--.-s';
  };

  const updateAnalysisTimer = () => {
    if (!analysisTimerEl || !analysisTimerDeadline) return;
    const remaining = Math.max(0, analysisTimerDeadline - performance.now());
    analysisTimerEl.textContent = `${(remaining / 1000).toFixed(1)}s`;
  };

  const startAnalysisTimer = (durationMs) => {
    if (!analysisTimerEl) return;
    stopAnalysisTimer();
    analysisTimerDeadline = performance.now() + durationMs;
    updateAnalysisTimer();
    analysisTimerInterval = setInterval(() => {
      if (!analysisTimerDeadline) return;
      if (performance.now() >= analysisTimerDeadline) {
        stopAnalysisTimer(true);
      } else {
        updateAnalysisTimer();
      }
    }, 100);
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
    setStatus('Bot thinking...');
    const baseState = cloneState(game.state);
    analysisDisplay.showPosition(baseState, { infoText: 'Quick scan...' });

    try {
      const sideMs = game.state.turn === 'w' ? game.state.whiteMs : game.state.blackMs;
      const minBudget = 100;
      const targetBudget = Math.max(minBudget, botBudgetMs);
      const timeBudget = Math.max(minBudget, Math.min(targetBudget, sideMs || targetBudget));
      await new Promise((resolve) => requestAnimationFrame(resolve));
      startAnalysisTimer(timeBudget);
      const move = await bot.chooseMove(game, {
        timeMs: timeBudget,
        fastWeights: botFastWeights,
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
      stopAnalysisTimer(true);
      botThinking = false;
      if (!game.getResult()) {
        setStatus(game.state.turn === 'w' ? 'White to move' : 'Black to move');
      }
      if (game) {
        const finishInfo = game.getResult() ? 'Bot finished.' : 'Ready for your move.';
        analysisDisplay.showPosition(cloneState(game.state), { infoText: finishInfo });
      }
      checkResult();
    }
  };

  const startNewGame = ({ side, sampleSeconds, fastWeights }) => {
    if (bot) bot.dispose();

    playerSide = side;
    botFastWeights = sanitizeFastWeightObj(fastWeights);
    const seconds = Number.isFinite(sampleSeconds) ? sampleSeconds : DEFAULT_THINK_SECONDS;
    botBudgetMs = Math.max(1, Math.min(30, seconds)) * 1000;
    botThinking = false;
    stopAnalysisTimer();

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
    analysisDisplay.showPosition(cloneState(game.state), { infoText: 'Fast bot warming up...' });
    dlg.close();

    maybeBotMove();
  };

  const sacrificeSlider = null;
  const sacrificeLabel = null;
  const botStyleSelect = null;
  const fastWeightsSection = document.getElementById('fastWeightsSection');
  const fastWeightInputs = {};
  FAST_WEIGHT_KEYS.forEach((key) => {
    const input = form.elements.namedItem(`fast_${key}`);
    if (input) {
      fastWeightInputs[key] = input;
      input.value = DEFAULT_FAST_WEIGHTS[key];
    }
  });

  const clampDepth = (value) => {
    const numeric = Number.isFinite(value) ? value : BOT_DEPTH;
    return Math.max(BOT_MIN_DEPTH, Math.min(BOT_MAX_DEPTH, Math.round(numeric)));
  };

  const sanitizeFastWeightObj = (raw) => {
    const result = { ...DEFAULT_FAST_WEIGHTS };
    if (!raw) return result;
    FAST_WEIGHT_KEYS.forEach((key) => {
      const value = Number.parseFloat(raw[key]);
      if (Number.isFinite(value)) {
        result[key] = Math.max(-FAST_WEIGHT_LIMIT, Math.min(FAST_WEIGHT_LIMIT, value));
      }
    });
    return result;
  };

  const readFastWeights = () => {
    const current = {};
    Object.entries(fastWeightInputs).forEach(([key, input]) => {
      current[key] = input.value;
    });
    return sanitizeFastWeightObj(current);
  };

  Object.entries(fastWeightInputs).forEach(([key, input]) => {
    input.addEventListener('change', () => {
      const value = Number.parseFloat(input.value);
      if (Number.isFinite(value)) {
        input.value = Math.max(-FAST_WEIGHT_LIMIT, Math.min(FAST_WEIGHT_LIMIT, value));
      } else {
        input.value = DEFAULT_FAST_WEIGHTS[key];
      }
    });
  });

  if (fastWeightsSection) {
    fastWeightsSection.classList.remove('disabled');
  }

  newGameBtn.addEventListener('click', () => dlg.showModal());

  startGameBtn.addEventListener('click', (event) => {
    event.preventDefault();
    const sideInput = form.elements.namedItem('side');
    const side = sideInput ? sideInput.value : 'w';
    const secondsInput = form.elements.namedItem('sampleSeconds');
    const sampleSeconds = secondsInput ? parseFloat(secondsInput.value) : DEFAULT_THINK_SECONDS;
    startNewGame({
      side: side || 'w',
      sampleSeconds,
      fastWeights: readFastWeights(),
    });
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

