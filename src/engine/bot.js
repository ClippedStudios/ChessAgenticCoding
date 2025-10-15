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
    let config;
    if (typeof options === 'number') {
      config = { depth: options };
    } else if (options && typeof options === 'object') {
      config = Object.assign({}, options);
    } else {
      config = {};
    }
    const {
      mode = 'strategic',
      depth = 3,
      timeMs = 10000,
      sacrificeBias = 0.25,
      onUpdate,
      fastWeights = null,
    } = config;

    const statePayload = serializeState(game.state);

    return new Promise((resolve, reject) => {
      const resultTimer =
        timeMs > 0
          ? setTimeout(() => {
              cleanup();
              resolve(null);
            }, timeMs + 500)
          : null;
      const forceStopTimer =
        timeMs > 0
          ? setTimeout(() => {
              try {
                this.worker.postMessage({ type: 'stop' });
              } catch (err) {
                // ignore post errors
              }
            }, timeMs)
          : null;

      const cleanup = () => {
        if (resultTimer) clearTimeout(resultTimer);
        if (forceStopTimer) clearTimeout(forceStopTimer);
        this.worker.removeEventListener('message', handleMessage);
        this.worker.removeEventListener('error', handleError);
      };

      const handleMessage = (event) => {
        const { data } = event;
        if (!data || typeof data !== 'object') return;
        if (data.type === 'pv') {
          if (onUpdate) onUpdate(data);
          return;
        }
        if (data.type === 'result') {
          cleanup();
          resolve(data.move || null);
          return;
        }
        if (data.type === 'error') {
          cleanup();
          reject(new Error(data.message || 'Bot worker error'));
          return;
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
        sacrificeBias,
        fastWeights: fastWeights ? { ...fastWeights } : null,
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
