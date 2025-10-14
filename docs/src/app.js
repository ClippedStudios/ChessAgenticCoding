import { createBoardUI } from './ui/board.js';
import { createGame } from './chess/game.js';
import { Bot } from './engine/bot.js';
import { cloneState } from './chess/rules.js';
import { createAnalysisDisplay } from './ui/analysisBoard.js';

const BOT_DEPTH = 2;
const BOT_MOVE_TIME_MS = 10_000;
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

  const maybeBotMove = async () => {\n    if (!bot || botThinking || game.isGameOver()) return;\n    if (game.state.turn === playerSide) return;\n\n    botThinking = true;\n    const mode = botModeSetting;\n    setStatus(mode === 'random' ? 'Bot experimenting with ideas…' : 'Bot thinking...');\n    const baseState = cloneState(game.state);\n    analysisDisplay.showPosition(baseState, { infoText: 'Exploring moves...' });\n    let updateCount = 0;\n\n    const handleUpdate = (payload) => {\n      if (!payload) return;\n      if (payload.type === 'sample') {\n        const sampleIndex = payload.samples ?? ++updateCount;\n        const moveLabel = payload.moveNotation ?   : '';\n        const infoText = Sample # eval ;\n        analysisDisplay.queueLine(baseState, payload.line || [], { infoText });\n        return;\n      }\n      if (payload.type === 'pv') {\n        updateCount += 1;\n        const moveLabel = payload.currentMove ?   : '';\n        const infoText = Guess # depth  eval ;\n        analysisDisplay.queueLine(baseState, payload.line || [], { infoText });\n      }\n    };\n\n    try {\n      const sideMs = game.state.turn === 'w' ? game.state.whiteMs : game.state.blackMs;\n      const minBudget = mode === 'random' ? 200 : 500;\n      const targetBudget = Math.max(minBudget, botBudgetMs);\n      const timeBudget = Math.max(minBudget, Math.min(targetBudget, sideMs || targetBudget));\n      await new Promise((resolve) => requestAnimationFrame(resolve));\n      const move = await bot.chooseMove(game, {\n        mode,\n        depth: BOT_DEPTH,\n        timeMs: timeBudget,\n        sampleWindowMs: timeBudget,\n        onUpdate: handleUpdate,\n      });\n\n      if (move) {\n        const result = game.playMove(move);\n        ui.render(game);\n        appendMoveSAN(result.san);\n      }\n    } catch (err) {\n      console.error('Bot move failed', err);\n      game.state.result = { outcome: 'error', message: 'Bot failed to move' };\n      setStatus('Bot move failed - you win by error');\n      analysisDisplay.clear({ infoText: 'Bot encountered an error.' });\n    } finally {\n      botThinking = false;\n      if (!game.getResult()) {\n        setStatus(game.state.turn === 'w' ? 'White to move' : 'Black to move');\n      }\n      if (game) {\n        analysisDisplay.showPosition(cloneState(game.state), {\n          infoText: game.getResult() ? 'Bot finished.' : 'Ready for your move.',\n        });\n      }\n      checkResult();\n    }\n  };
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

  const startNewGame = ({ side, mode, sampleSeconds }) => {\n    if (bot) bot.dispose();\n\n    playerSide = side;\n    botModeSetting = mode;\n    const seconds = Number.isFinite(sampleSeconds) ? sampleSeconds : DEFAULT_SAMPLE_SECONDS;\n    botBudgetMs = Math.max(1, Math.min(30, seconds)) * 1000;\n    botThinking = false;\n\n    game = createGame();\n    bot = new Bot(playerSide === 'w' ? 'b' : 'w');\n\n    ui = createBoardUI(boardEl, game, {\n      onUserMove: (move) => {\n        if (botThinking || game.state.turn !== playerSide) return;\n        analysisDisplay.clear({ infoText: 'Player exploring...' });\n        const result = game.playMove(move);\n        if (!result) return;\n        ui.render(game);\n        appendMoveSAN(result.san);\n        checkResult();\n        maybeBotMove();\n      },\n    });\n\n    ui.setPerspective(playerSide);\n    ui.setPlayerSide(playerSide);\n    ui.render(game);\n\n    movesEl.innerHTML = '';\n    setStatus(playerSide === 'w' ? 'White to move' : 'Black to move');\n    analysisDisplay.showPosition(cloneState(game.state), { infoText: 'Waiting for bot...' });\n    dlg.close();\n\n    maybeBotMove();\n  };

  newGameBtn.addEventListener('click', () => dlg.showModal());

  startGameBtn.addEventListener('click', (event) => {
    event.preventDefault();
    const sideInput = form.elements.namedItem('side');
    const side = sideInput ? sideInput.value : 'w';
    const modeInput = form.elements.namedItem('botMode');\n      const mode = modeInput ? modeInput.value : 'search';\n      const secondsInput = form.elements.namedItem('sampleSeconds');\n      const sampleSeconds = secondsInput ? parseFloat(secondsInput.value) : DEFAULT_SAMPLE_SECONDS;\n      startNewGame({ side: side || 'w', mode, sampleSeconds });
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






