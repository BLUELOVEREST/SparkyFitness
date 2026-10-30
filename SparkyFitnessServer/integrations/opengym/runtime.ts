import type { Notification, PoolClient } from 'pg';
import { getRawOwnerPool } from '../../db/poolManager.js';
import { log } from '../../config/logging.js';
import * as repository from '../../models/sparkyGymRepository.js';
import * as archiveCleanup from '../../models/sparkyGymArchiveCleanupRepository.js';
import { DeliveryWorker } from './delivery.js';
import { sparkyGymService, type SparkyGymService } from './service.js';
import type {
  SparkyGymOutbox,
  SparkyGymArchiveCleanupJob,
} from '@workspace/shared';

type RuntimeJob =
  | { kind: 'outbox'; job: SparkyGymOutbox }
  | { kind: 'archive'; job: SparkyGymArchiveCleanupJob };

/** LISTEN is only a committed wakeup hint. Durable queues/cursors own correctness. */
export class SparkyGymRuntime {
  private client: PoolClient | undefined;
  private reconnect: ReturnType<typeof setTimeout> | undefined;
  private running = false;
  private connecting: Promise<void> | undefined;
  private readonly listeners = new Map<string, Set<() => void>>();
  private count = 0;
  private readonly closeHandlers = new Set<() => void>();
  readonly worker: DeliveryWorker<RuntimeJob>;

  constructor(service: SparkyGymService = sparkyGymService) {
    this.worker = new DeliveryWorker({
      claim: async (): Promise<RuntimeJob | null> => {
        const cleanup = await archiveCleanup.listDueArchiveCleanup();
        if (cleanup) return { kind: 'archive', job: cleanup };
        const job = (await repository.listDueOutbox())[0];
        return job ? { kind: 'outbox', job } : null;
      },
      deliver: (work, signal) =>
        work.kind === 'archive'
          ? archiveCleanup.processArchiveCleanup(work.job, signal)
          : service.deliver(work.job, signal),
      nextDeadline: async () => {
        const archive = await archiveCleanup.nextArchiveCleanupDeadline();
        const outbox = (await repository.getNextDueWorker())?.getTime() ?? null;
        return archive === null
          ? outbox
          : outbox === null
            ? archive
            : Math.min(archive, outbox);
      },
      onError: () =>
        log(
          'warn',
          'SparkyGym durable worker will recover after a transient failure'
        ),
    });
    service.setWakeHandler(() => this.worker.wake());
  }

  subscribe(
    owner: string,
    callback: () => void,
    onStop: () => void = () => {}
  ): () => void {
    if (this.count >= 256 || (this.listeners.get(owner)?.size ?? 0) >= 8)
      throw new Error('notification_listener_limit');
    let callbacks = this.listeners.get(owner);
    if (!callbacks) {
      callbacks = new Set();
      this.listeners.set(owner, callbacks);
    }
    callbacks.add(callback);
    this.count++;
    this.closeHandlers.add(onStop);
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      callbacks.delete(callback);
      this.count--;
      this.closeHandlers.delete(onStop);
      if (!callbacks.size) this.listeners.delete(owner);
    };
  }

  private notify(owner?: string): void {
    const groups = owner
      ? [this.listeners.get(owner)]
      : this.listeners.values();
    for (const callbacks of groups)
      for (const callback of callbacks ?? []) {
        try {
          callback();
        } catch {
          /* a disconnected subscriber cannot stop other owners */
        }
      }
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.worker.start();
    await this.connect();
  }

  private async connect(): Promise<void> {
    if (!this.running || this.connecting || this.client) return;
    this.connecting = (async () => {
      let client: PoolClient | undefined;
      try {
        // A dedicated background LISTEN client, never used for owner request queries.
        client = (await getRawOwnerPool().connect()) as PoolClient;
        if (!this.running) {
          client.release();
          return;
        }
        this.client = client;
        const current = client;
        const failed = () => {
          if (this.client !== current) return;
          this.client = undefined;
          current.removeListener('notification', notified);
          current.removeListener('end', failed);
          current.removeListener('error', failed);
          current.release(true);
          this.scheduleReconnect();
        };
        const notified = (event: Notification) => {
          if (event.channel === 'sparkygym_outbox') this.worker.wake();
          else if (event.channel === 'sparkygym_archive_cleanup')
            this.worker.wake();
          else if (event.channel === 'sparkygym_notifications' && event.payload)
            this.notify(event.payload);
        };
        current.on('notification', notified);
        current.on('error', failed);
        current.on('end', failed);
        await current.query('LISTEN sparkygym_outbox');
        await current.query('LISTEN sparkygym_archive_cleanup');
        await current.query('LISTEN sparkygym_notifications');
        this.worker.wake();
        this.notify();
      } catch {
        if (this.client === client) {
          this.client = undefined;
          client?.release(true);
        }
        this.scheduleReconnect();
      }
    })().finally(() => {
      this.connecting = undefined;
    });
    await this.connecting;
  }

  private scheduleReconnect(): void {
    if (!this.running || this.reconnect) return;
    // A connection-recovery deadline, not periodic peer/business-data polling.
    this.reconnect = setTimeout(() => {
      this.reconnect = undefined;
      void this.connect();
    }, 3000);
    this.reconnect.unref();
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.reconnect) clearTimeout(this.reconnect);
    this.reconnect = undefined;
    await this.connecting;
    const current = this.client;
    this.client = undefined;
    if (current) {
      current.removeAllListeners('notification');
      try {
        await current.query('UNLISTEN *');
      } catch {
        /* destroy this dedicated connection in either case */
      } finally {
        current.release(true);
      }
    }
    for (const close of this.closeHandlers) {
      try {
        close();
      } catch {
        /* continue closing the remaining streams */
      }
    }
    this.closeHandlers.clear();
    this.listeners.clear();
    this.count = 0;
    await this.worker.stop();
  }
}

export const sparkyGymRuntime = new SparkyGymRuntime();
