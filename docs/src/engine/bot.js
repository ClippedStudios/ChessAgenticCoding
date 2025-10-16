const WORKER_URL = new URL('./bot.worker.js', import.meta.url);

function serializeState(state) {
  return {
    board: state.board.map((row) => [...row]),
    turn: state.turn,
    castling: { ...state.castling },
    ep: state.ep ? { ...state.ep } : null,
    halfmove: state.halfmove,
    fullmove: state.fullmove,
  };
}

export class Bot {
  constructor(side) {
    this.side = side;
    this.worker = new Worker(WORKER_URL, { type: 'module' });
  }

  ensureWorker() {
    if (!this.worker) {
      this.worker = new Worker(WORKER_URL, { type: 'module' });
    }
  }

  chooseMove(game, options = {}) {
    this.ensureWorker();
    const timeMs = Number.isFinite(options.timeMs) ? options.timeMs : 0;
    const fastWeights = options.fastWeights ? { ...options.fastWeights } : null;
    const statePayload = serializeState(game.state);

    return new Promise((resolve, reject) => {
      const handleMessage = (event) => {
        const { data } = event;
        if (!data || typeof data !== 'object') return;
        if (data.type === 'result') {
          cleanup();
          resolve(data.move || null);
        }
        if (data.type === 'error') {
          cleanup();
          reject(new Error(data.message || 'Bot worker error'));
        }
      };

      const handleError = (err) => {
        cleanup();
        reject(err);
      };

      const cleanup = () => {
        this.worker.removeEventListener('message', handleMessage);
        this.worker.removeEventListener('error', handleError);
      };

      this.worker.addEventListener('message', handleMessage);
      this.worker.addEventListener('error', handleError);
      this.worker.postMessage({
        type: 'analyze',
        state: statePayload,
        side: this.side,
        timeLimitMs: timeMs,
        fastWeights,
      });
    });
  }

  dispose() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
  }
}
