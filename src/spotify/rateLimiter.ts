export class RateLimitError extends Error {
  constructor(public readonly retryAfterMs: number) {
    super(`Spotify rate limit encountered. Retry after ${retryAfterMs}ms.`);
    this.name = "RateLimitError";
  }
}

export type QueueTask<T> = () => Promise<T>;

type QueueEntry<T> = {
  task: QueueTask<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
};

export class RateLimitedQueue {
  private running = false;
  private queue: Array<QueueEntry<any>> = [];
  private retryAt = 0;

  enqueue<T>(task: QueueTask<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({ task, resolve, reject });
      void this.process();
    });
  }

  private async process(): Promise<void> {
    if (this.running) {
      return;
    }

    this.running = true;
    while (this.queue.length > 0) {
      const now = Date.now();
      if (this.retryAt > now) {
        await new Promise((res) => setTimeout(res, this.retryAt - now));
      }

  const item = this.queue.shift();
      if (!item) {
        break;
      }

      try {
        const result = await item.task();
        item.resolve(result);
      } catch (error) {
        if (error instanceof RateLimitError) {
          this.retryAt = Date.now() + error.retryAfterMs;
          this.queue.unshift(item);
        } else {
          item.reject(error);
        }
      }
    }
    this.running = false;
  }
}
