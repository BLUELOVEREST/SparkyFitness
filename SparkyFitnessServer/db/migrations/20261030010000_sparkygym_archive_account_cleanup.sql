-- This ledger must outlive the account and all of its cascading media rows.
CREATE TABLE public.sparkygym_archive_cleanup_jobs (
  owner_id uuid PRIMARY KEY,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 20),
  next_due_at timestamptz NOT NULL DEFAULT now(),
  last_error text CHECK (last_error IN ('archive_cleanup_failed','owner_still_exists')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sparkygym_archive_cleanup_due ON public.sparkygym_archive_cleanup_jobs(next_due_at);
ALTER TABLE public.sparkygym_archive_cleanup_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sparkygym_archive_cleanup_jobs FROM PUBLIC;
CREATE POLICY deny_all_policy ON public.sparkygym_archive_cleanup_jobs
  FOR ALL TO PUBLIC USING (false) WITH CHECK (false);

CREATE FUNCTION sparkygym_private.enqueue_account_archive_cleanup() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  -- DELETE already holds the user tuple lock. Never acquire the owner advisory
  -- lock here: imports acquire that lock before connection/FK/row locks.
  -- Only the post-commit background worker takes the owner lock.
  INSERT INTO public.sparkygym_archive_cleanup_jobs(owner_id) VALUES (OLD.id)
    ON CONFLICT (owner_id) DO UPDATE SET next_due_at=now(), updated_at=now();
  PERFORM pg_notify('sparkygym_archive_cleanup', '');
  RETURN OLD;
END $$;
REVOKE ALL ON FUNCTION sparkygym_private.enqueue_account_archive_cleanup() FROM PUBLIC;
CREATE TRIGGER sparkygym_account_archive_cleanup AFTER DELETE ON public."user"
  FOR EACH ROW EXECUTE FUNCTION sparkygym_private.enqueue_account_archive_cleanup();
