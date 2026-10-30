import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DeliveryWorker,
  retryDeadline,
} from '../integrations/opengym/delivery.js';

afterEach(() => vi.useRealTimers());

describe('one-shot durable delivery wakeups', () => {
  it('recovers queued work at startup, coalesces wakes and stops without intervals', async () => {
    let pending = [1, 2];
    const delivered: number[] = [];
    const worker = new DeliveryWorker({
      claim: async () => pending.shift() ?? null,
      deliver: async (job) => {
        delivered.push(job);
      },
      nextDeadline: async () => null,
      onError: () => {},
    });
    worker.start();
    worker.wake();
    worker.wake();
    await worker.idle();
    expect(delivered).toEqual([1, 2]);
    pending = [3];
    worker.wake();
    await worker.idle();
    expect(delivered).toEqual([1, 2, 3]);
    await worker.stop();
    pending = [4];
    worker.wake();
    expect(delivered).toEqual([1, 2, 3]);
  });

  it('uses the persisted next retry once and handles a commit during deadline lookup', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    let pending: number[] = [];
    let deadline: number | null = 2000;
    const delivered: number[] = [];
    const worker = new DeliveryWorker({
      claim: async () => pending.shift() ?? null,
      deliver: async (job) => {
        delivered.push(job);
        deadline = null;
      },
      nextDeadline: async () => deadline,
      onError: () => {},
    });
    worker.start();
    await worker.idle();
    expect(vi.getTimerCount()).toBe(1);
    pending = [1];
    await vi.advanceTimersByTimeAsync(1000);
    await worker.idle();
    expect(delivered).toEqual([1]);
    expect(vi.getTimerCount()).toBe(0);
    await worker.stop();
  });

  it('never overlaps jobs and drains a wake that arrived while one was running', async () => {
    let release: (() => void) | undefined;
    let count = 0;
    const pending = [1];
    const worker = new DeliveryWorker({
      claim: async () => pending.shift() ?? null,
      deliver: async () => {
        count++;
        if (count === 1)
          await new Promise<void>((resolve) => {
            release = resolve;
          });
      },
      nextDeadline: async () => null,
      onError: () => {},
    });
    worker.start();
    await Promise.resolve();
    await Promise.resolve();
    pending.push(2);
    worker.wake();
    release?.();
    await worker.idle();
    expect(count).toBe(2);
    await worker.stop();
  });

  it('bounds retry delay and honors bounded Retry-After without data polling', () => {
    expect(retryDeadline(0, 1000, undefined, () => 0)).toBeGreaterThan(1000);
    expect(retryDeadline(99, 1000, '999999999', () => 0)).toBeLessThanOrEqual(
      901000
    );
    expect(retryDeadline(1, 1000, '60', () => 0)).toBe(61000);
    expect(retryDeadline(1, 1000, 'not a date', () => 0)).toBeGreaterThan(1000);
  });
});
