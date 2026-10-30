import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = () =>
  readFileSync(
    new URL(
      '../db/migrations/20261029120000_sparkygym_core.sql',
      import.meta.url
    ),
    'utf8'
  );
describe('SparkyGym migration security contract', () => {
  it('persists owner-scoped snapshot membership and permits only precommit packet finalization', () => {
    const sql = migration();
    expect(sql).toContain('CREATE TABLE public.sparkygym_snapshots');
    expect(sql).toContain('CREATE TABLE public.sparkygym_snapshot_members');
    expect(sql).toContain('FOREIGN KEY (user_id,connection_id,snapshot_id)');
    expect(sql).toContain('OLD.created_xid<>pg_current_xact_id()');
  });
  it('preserves custom measurement UUID identities and does not collapse hourly history', () => {
    const sql = migration();
    expect(sql).not.toContain('DISTINCT ON (cm.entry_date)');
    expect(sql).toContain('entity_id:=measurement.id::text');
  });
  it('isolates privileged enqueue helpers from blanket public-function grants', () => {
    expect(migration()).toContain(
      'CREATE SCHEMA IF NOT EXISTS sparkygym_private'
    );
    expect(migration()).toContain(
      'REVOKE ALL ON SCHEMA sparkygym_private FROM PUBLIC'
    );
  });
  it('captures all authoritative BODY sources and never nutrition goals', () => {
    const sql = migration();
    for (const table of [
      'check_in_measurements',
      'custom_categories',
      'custom_measurements',
      'onboarding_data',
    ])
      expect(sql).toContain(`ON public.${table}`);
    expect(sql).not.toContain('ON public.user_goals');
    expect(sql).toContain("pg_notify('sparkygym_outbox'");
    expect(sql).toContain("pg_notify('sparkygym_notifications'");
  });
  it('has composite owner foreign keys and immutable exact-body enforcement', () => {
    expect(migration()).toContain('FOREIGN KEY (user_id, connection_id)');
    expect(migration()).toContain('immutable_outbox');
  });
});
