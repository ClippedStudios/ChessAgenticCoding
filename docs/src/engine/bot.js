const WORKER_URL = new URL('./bot.worker.js', import.meta.url);

function serializeState(state) {
  return {
    board: state.board.map(row => [...row]),
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
    if (!this.worker) this.worker = new Worker(WORKER_URL, { type: 'module' });
  }

  chooseMove(game, options = {}) {
    this.ensureWorker();
    let config;
    if (typeof options === 'number') {
      config = { depth: options };
    } else {
      config = options || {};
    }
    const {\n      mode = 'search',\n      depth = 2,\n      timeMs = 10_000,\n      sampleWindowMs = timeMs,\n      sacrificeBias = 0.25,\n      onUpdate,\n    } = config;

    const statePayload = serializeState(game.state);
    return new Promise((resolve, reject) => {
      const timer = timeMs > 0 ? setTimeout(() => {
        cleanup();
        resolve(null);
      }, timeMs + 500) : null;

      const cleanup = () => {
        if (timer) clearTimeout(timer);
        this.worker.removeEventListener('message', handleMessage);
        this.worker.removeEventListener('error', handleError);
      };

      const handleMessage = (event) => {
        const { data } = event;
        if (!data || typeof data !== 'object') return;
        if (data.type === 'pv' || data.type === 'sample') {
          onUpdate?.(data);
          return;
        }
        if (data.type === 'result') {
          cleanup();
          resolve(data.move || null);
        }
      };

      const handleError = (err) => {
        cleanup();
        reject(err);
      };

      this.worker.addEventListener('message', handleMessage);
      this.worker.addEventListener('error', handleError);
      this.worker.postMessage({
        type: 'analyze',
        mode,
        state: statePayload,
        side: this.side,
        depth,
        timeLimitMs: timeMs,
        sampleWindowMs,\n        sacrificeBias,
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


