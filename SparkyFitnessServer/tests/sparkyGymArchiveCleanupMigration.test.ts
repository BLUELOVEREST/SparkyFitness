import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = fs.readFileSync(
  new URL(
    '../db/migrations/20261030010000_sparkygym_archive_account_cleanup.sql',
    import.meta.url
  ),
  'utf8'
);
describe('account archive cleanup migration contract', () => {
  it('enqueues for every user DELETE in the same transaction without an FK or lock inversion', () => {
    expect(migration).toMatch(/AFTER DELETE ON public\."user"/);
    expect(migration).toContain("pg_notify('sparkygym_archive_cleanup'");
    expect(migration).not.toMatch(/REFERENCES\s/i);
    expect(migration).not.toContain('pg_advisory_xact_lock');
    expect(migration).toContain(
      'SECURITY DEFINER SET search_path=pg_catalog,public'
    );
    expect(migration).toContain(
      'REVOKE ALL ON FUNCTION sparkygym_private.enqueue_account_archive_cleanup() FROM PUBLIC'
    );
  });
  it('denies every application context in both migration and startup RLS', () => {
    expect(migration).toContain('ENABLE ROW LEVEL SECURITY');
    expect(migration).toContain('USING (false) WITH CHECK (false)');
    const policies = fs.readFileSync(
      new URL('../db/rls_policies.sql', import.meta.url),
      'utf8'
    );
    expect(policies).toContain("'sparkygym_archive_cleanup_jobs'");
    expect(policies).toContain(
      'CREATE POLICY deny_all_policy ON public.sparkygym_archive_cleanup_jobs FOR ALL TO PUBLIC USING (false) WITH CHECK (false)'
    );
  });
});
