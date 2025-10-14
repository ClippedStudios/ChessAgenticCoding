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

  chooseMove(game, depth = 2, timeLimitMs = 1500) {
    this.ensureWorker();
    const statePayload = serializeState(game.state);
    return new Promise((resolve, reject) => {
      const timer = timeLimitMs > 0 ? setTimeout(() => {
        cleanup();
        resolve(null);
      }, timeLimitMs + 500) : null;

      const cleanup = () => {
        if (timer) clearTimeout(timer);
        this.worker.removeEventListener('message', handleMessage);
        this.worker.removeEventListener('error', handleError);
      };

      const handleMessage = (event) => {
        cleanup();
        const { move } = event.data;
        resolve(move || null);
      };

      const handleError = (err) => {
        cleanup();
        reject(err);
      };

      this.worker.addEventListener('message', handleMessage);
      this.worker.addEventListener('error', handleError);
      this.worker.postMessage({
        state: statePayload,
        side: this.side,
        depth,
        timeLimitMs,
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
