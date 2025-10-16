import { createBoardUI } from './ui/board.js';
import { createGame } from './chess/game.js';
import { Bot } from './engine/bot.js';

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

function sanitizeFastWeightObj(raw) {
  const result = { ...DEFAULT_FAST_WEIGHTS };
  if (!raw) return result;
  FAST_WEIGHT_KEYS.forEach((key) => {
    const value = Number.parseFloat(raw[key]);
    if (Number.isFinite(value)) {
      result[key] = Math.max(-FAST_WEIGHT_LIMIT, Math.min(FAST_WEIGHT_LIMIT, value));
    }
  });
  return result;
}

function init() {
  const boardEl = document.getElementById('board');
  const statusEl = document.getElementById('status');
  const movesEl = document.getElementById('moves');
  const dlg = document.getElementById('newGameDialog');
  const newGameBtn = document.getElementById('newGameBtn');
  const startGameBtn = document.getElementById('startGameBtn');
  const resignBtn = document.getElementById('resignBtn');
  const form = document.getElementById('newGameForm');
  const fastWeightsSection = document.getElementById('fastWeightsSection');

  if (!boardEl || !statusEl || !movesEl || !dlg || !newGameBtn || !startGameBtn || !resignBtn || !form) {
    console.error('Chess UI initialisation failed: missing required elements.');
    return;
  }

  let ui;
  let game;
  let bot;
  let playerSide = 'w';
  let botThinking = false;
  let botFastWeights = { ...DEFAULT_FAST_WEIGHTS };

  const fastWeightInputs = {};
  FAST_WEIGHT_KEYS.forEach((key) => {
    const input = form.elements.namedItem(`fast_${key}`);
    if (input) {
      fastWeightInputs[key] = input;
      input.value = DEFAULT_FAST_WEIGHTS[key];
    }
  });

  if (fastWeightsSection) {
    fastWeightsSection.classList.remove('disabled');
  }

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

  const setStatus = (text) => {
    statusEl.textContent = text;
  };

  const appendMoveSAN = (san) => {
    const div = document.createElement('div');
    div.textContent = san;
    movesEl.appendChild(div);
    movesEl.scrollTop = movesEl.scrollHeight;
  };

  const readFastWeights = () => {
    const current = {};
    Object.entries(fastWeightInputs).forEach(([key, input]) => {
      current[key] = input.value;
    });
    return sanitizeFastWeightObj(current);
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

    try {
      const move = await bot.chooseMove(game, {
        timeMs: 0,
        fastWeights: botFastWeights,
      });

      if (move) {
        const result = game.playMove(move);
        if (result) {
          ui.render(game);
          appendMoveSAN(result.san);
        }
      }
    } catch (err) {
      console.error('Bot move failed', err);
      game.state.result = { outcome: 'error', message: 'Bot failed to move' };
      setStatus('Bot move failed - you win by error');
    } finally {
      botThinking = false;
      if (!game.getResult()) {
        setStatus(game.state.turn === 'w' ? 'White to move' : 'Black to move');
      }
      checkResult();
    }
  };

  const startNewGame = ({ side, fastWeights }) => {
    if (bot) bot.dispose();

    playerSide = side;
    botFastWeights = sanitizeFastWeightObj(fastWeights);
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
  };

  newGameBtn.addEventListener('click', () => dlg.showModal());

  startGameBtn.addEventListener('click', (event) => {
    event.preventDefault();
    const sideInput = form.elements.namedItem('side');
    const side = sideInput ? sideInput.value : 'w';

    startNewGame({
      side: side || 'w',
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
