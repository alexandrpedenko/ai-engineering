// A single-reader queue: one side pushes values (and then ends or fails it),
// the other reads them with `for await`. Values pushed before anyone reads are
// kept. Used to let one SDK stream feed both a run's events and its result.
export class AsyncQueue<T> implements AsyncIterable<T> {
  private readonly items: T[] = [];
  private ended = false;
  private failure: { error: unknown } | null = null;
  private wake: (() => void) | null = null;

  push(item: T): void {
    if (this.ended || this.failure) return;
    this.items.push(item);
    this.notify();
  }

  end(): void {
    this.ended = true;
    this.notify();
  }

  fail(error: unknown): void {
    this.failure = { error };
    this.notify();
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<T> {
    for (;;) {
      const item = this.items.shift();
      if (item !== undefined) {
        yield item;
        continue;
      }
      if (this.failure) throw this.failure.error;
      if (this.ended) return;
      await new Promise<void>((resolve) => {
        this.wake = resolve;
      });
    }
  }

  private notify(): void {
    const wake = this.wake;
    this.wake = null;
    wake?.();
  }
}
