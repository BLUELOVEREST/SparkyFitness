interface DeliveryAdapter<Job> {
  claim(): Promise<Job | null>;
  deliver(job: Job, signal: AbortSignal): Promise<void>;
  nextDeadline(): Promise<number | null>;
  onError(error: unknown): void;
}

export function retryDeadline(
  attempt: number,
  now: number,
  retryAfter?: string,
  random = Math.random
): number {
  const cappedAttempt = Math.min(
    20,
    Math.max(0, Number.isFinite(attempt) ? Math.floor(attempt) : 0)
  );
  const jitter = 0.8 + Math.max(0, Math.min(1, random())) * 0.4;
  const exponential = Math.min(900000, 1000 * 2 ** cappedAttempt * jitter);
  let requested = 0;
  if (retryAfter && /^\d{1,12}$/.test(retryAfter))
    requested = Number(retryAfter) * 1000;
  else if (retryAfter) {
    const instant = Date.parse(retryAfter);
    if (Number.isFinite(instant)) requested = Math.max(0, instant - now);
  }
  return now + Math.min(900000, Math.max(exponential, requested));
}

// Adapter owns the durable claim/receipt transaction. Wakeups are hints; persisted
// due times and leases are recovered at startup and after listener reconnect.
export class DeliveryWorker<Job> {
  private running = false;
  private dirty = false;
  private task: Promise<void> | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private current: AbortController | undefined;

  constructor(private readonly adapter: DeliveryAdapter<Job>) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.wake();
  }

  wake(): void {
    if (!this.running) return;
    this.dirty = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    if (this.task) return;
    const task = this.drain().finally(() => {
      if (this.task === task) this.task = undefined;
      if (this.running && this.dirty) this.wake();
    });
    this.task = task;
  }

  private async drain(): Promise<void> {
    let failure = false;
    try {
      let count = 0;
      do {
        this.dirty = false;
        while (this.running && count++ < 100) {
          const job = await this.adapter.claim();
          if (job === null) break;
          this.current = new AbortController();
          try {
            await this.adapter.deliver(job, this.current.signal);
          } finally {
            this.current = undefined;
          }
        }
        if (count >= 100 && this.running) break;
      } while (this.running && this.dirty);
      if (count >= 100 && this.running) {
        this.schedule(Date.now() + 1);
        return;
      }
    } catch (error) {
      failure = true;
      try {
        this.adapter.onError(error);
      } catch {
        /* logging cannot break queue recovery */
      }
    }
    if (!this.running) return;
    try {
      const due = await this.adapter.nextDeadline();
      const retry = failure ? Date.now() + 5000 : null;
      this.schedule(
        due === null ? retry : retry === null ? due : Math.min(due, retry)
      );
    } catch (error) {
      try {
        this.adapter.onError(error);
      } catch {
        /* retain the recovery wakeup */
      }
      this.schedule(Date.now() + 5000);
    }
  }

  private schedule(deadline: number | null): void {
    if (!this.running || deadline === null) return;
    if (this.timer) clearTimeout(this.timer);
    const delay = Math.min(2147483647, Math.max(1, deadline - Date.now()));
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.wake();
    }, delay);
    this.timer.unref?.();
  }

  async idle(): Promise<void> {
    while (this.task) await this.task;
  }

  async stop(): Promise<void> {
    this.running = false;
    this.dirty = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    this.current?.abort();
    await this.idle();
  }
}
