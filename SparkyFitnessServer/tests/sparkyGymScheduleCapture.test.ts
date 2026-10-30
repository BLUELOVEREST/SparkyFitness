import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (name: string) =>
  fs.readFileSync(new URL(name, import.meta.url), 'utf8');

describe('native weekly hint capture boundary', () => {
  it('skips identical current-transaction packets before invoking the emitter but compares stale snapshot content', () => {
    const sql = read(
      '../db/migrations/20261030020000_sparkygym_weekly_training_hints.sql'
    );
    expect(sql).toContain('CREATE FUNCTION sparkygym_private.publish_schedule');
    expect(sql).toContain('o.created_xid=pg_current_xact_id()');
    expect(sql).toContain(
      "o.body::jsonb->'payload' IS NOT DISTINCT FROM coalesce(packet,'null'::jsonb)"
    );
    expect(sql).toContain("o.body::jsonb->>'operation'=operation");
    expect(sql).toContain('c.id=o.connection_id');
  });
  it('defers source capture until the final source transaction state without a second queue', () => {
    const sql = read(
      '../db/migrations/20261030020000_sparkygym_weekly_training_hints.sql'
    );
    expect(sql).toContain('DEFERRABLE INITIALLY DEFERRED');
    expect(sql).toContain('ON public.workout_plan_templates');
    expect(sql).toContain('ON public.workout_plan_focus_sessions');
    expect(sql).toContain('ON public.user_preferences');
    expect(sql).not.toContain('CREATE TABLE');
    expect(sql).toContain('sparkygym_private.emit(');
  });

  it('publishes native buckets and source dates, never synthetic clock or slot identities', () => {
    const sql = read(
      '../db/migrations/20261030020000_sparkygym_weekly_training_hints.sql'
    );
    expect(sql).toContain("'time_slot',fs.time_slot");
    expect(sql).toContain("'effective_from',t.start_date::text");
    expect(sql).toContain("'effective_until',t.end_date::text");
    expect(sql).toContain("t.plan_mode='training_focus'");
    expect(sql).toContain("t.schedule_type='weekly'");
    expect(sql).not.toMatch(/slot_id|time_of_day/);
    expect(sql).toContain('first_day_of_week');
  });

  it('keeps parameterized schedule helpers private and exposes only an actor-bound source snapshot', () => {
    const sql = read(
      '../db/migrations/20261030020000_sparkygym_weekly_training_hints.sql'
    );
    expect(sql).toContain('public.sparkygym_schedule_snapshot()');
    expect(sql).toContain("current_setting('app.authenticated_user_id',true)");
    expect(sql).toContain(
      'REVOKE ALL ON ALL FUNCTIONS IN SCHEMA sparkygym_private FROM PUBLIC'
    );
  });

  it('does not accept or project OG-origin schedule state into native SF plans', () => {
    const projections = read('../integrations/opengym/projections.ts');
    expect(projections).not.toContain('applySchedule');
    expect(projections).not.toContain('workout_plan_templates');
    const guards = read(
      '../db/migrations/20261029130000_sparkygym_source_guards.sql'
    );
    expect(guards).not.toContain('workout_plan');
  });

  it('coalesces only packets in their creation transaction, and skips account body cascades before owner locking', () => {
    const core = read('../db/migrations/20261029120000_sparkygym_core.sql');
    expect(core).toContain("IF p_resource='schedule_summary'");
    expect(core).toContain('o.created_xid=pg_current_xact_id()');
    const capture = core.slice(
      core.indexOf('CREATE FUNCTION sparkygym_private.capture_body()')
    );
    expect(
      capture.indexOf('NOT EXISTS (SELECT 1 FROM public."user"')
    ).toBeLessThan(capture.indexOf('pg_advisory_xact_lock'));
  });
});
