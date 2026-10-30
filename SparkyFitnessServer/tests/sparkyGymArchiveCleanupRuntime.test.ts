import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SparkyGymArchiveCleanupJob } from '@workspace/shared';
import { SparkyGymRuntime } from '../integrations/opengym/runtime.js';

const state = vi.hoisted(() => ({
  connect: vi.fn(),
  pending: [] as SparkyGymArchiveCleanupJob[],
  processed: vi.fn(),
  next: null as number | null,
}));
vi.mock('../db/poolManager.js', () => ({
  getRawOwnerPool: () => ({ connect: state.connect }),
}));
vi.mock('../models/sparkyGymRepository.js', () => ({
  listDueOutbox: async () => [],
  getNextDueWorker: async () => null,
}));
vi.mock('../models/sparkyGymArchiveCleanupRepository.js', () => ({
  listDueArchiveCleanup: async () => state.pending.shift() ?? null,
  nextArchiveCleanupDeadline: async () => state.next,
  processArchiveCleanup: async (job: SparkyGymArchiveCleanupJob) => {
    state.processed(job);
  },
}));
vi.mock('../integrations/opengym/service.js', () => ({
  sparkyGymService: { setWakeHandler: () => {}, deliver: vi.fn() },
}));

const runtimes: SparkyGymRuntime[] = [];
afterEach(async () => {
  for (const runtime of runtimes.splice(0)) await runtime.stop();
  state.pending = [];
  state.next = null;
  vi.clearAllMocks();
  vi.useRealTimers();
});
function job(): SparkyGymArchiveCleanupJob {
  return {
    owner_id: randomUUID(),
    attempts: 0,
    next_due_at: new Date(),
    last_error: null,
    created_at: new Date(),
    updated_at: new Date(),
  };
}
function listener() {
  return Object.assign(new EventEmitter(), {
    query: vi.fn(async () => ({ rows: [] })),
    release: vi.fn(),
  });
}

describe('account archive cleanup runtime wakeups', () => {
  it('recovers on startup and committed NOTIFY without idle polling', async () => {
    vi.useFakeTimers();
    const connection = listener();
    state.connect.mockResolvedValue(connection);
    const first = job();
    state.pending.push(first);
    const runtime = new SparkyGymRuntime();
    runtimes.push(runtime);
    await runtime.start();
    await runtime.worker.idle();
    expect(connection.query).toHaveBeenCalledWith(
      'LISTEN sparkygym_archive_cleanup'
    );
    expect(state.processed).toHaveBeenCalledWith(first);
    const second = job();
    state.pending.push(second);
    connection.emit('notification', {
      channel: 'sparkygym_archive_cleanup',
      payload: '',
    });
    await runtime.worker.idle();
    expect(state.processed).toHaveBeenCalledWith(second);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('recovers missed commits after LISTEN reconnect', async () => {
    vi.useFakeTimers();
    const first = listener();
    const second = listener();
    state.connect.mockResolvedValueOnce(first).mockResolvedValueOnce(second);
    const runtime = new SparkyGymRuntime();
    runtimes.push(runtime);
    await runtime.start();
    await runtime.worker.idle();
    first.emit('error', new Error('listener disconnected'));
    const pending = job();
    state.pending.push(pending);
    await vi.advanceTimersByTimeAsync(3000);
    await runtime.worker.idle();
    expect(second.query).toHaveBeenCalledWith(
      'LISTEN sparkygym_archive_cleanup'
    );
    expect(state.processed).toHaveBeenCalledWith(pending);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('arms only the persisted one-shot retry deadline and cancels it on shutdown', async () => {
    vi.useFakeTimers();
    state.connect.mockResolvedValue(listener());
    state.next = Date.now() + 60000;
    const runtime = new SparkyGymRuntime();
    runtimes.push(runtime);
    await runtime.start();
    await runtime.worker.idle();
    expect(vi.getTimerCount()).toBe(1);
    state.next = null;
    state.pending.push(job());
    await vi.advanceTimersByTimeAsync(60000);
    await runtime.worker.idle();
    expect(state.processed).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    await runtime.stop();
    expect(vi.getTimerCount()).toBe(0);
  });
});
