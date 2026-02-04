-- retention-function.sql
--
-- Enforce "keep 3 latest years" retention policy for council_users.
-- Behavior:
-- 1) Determine the 3 most-recent distinct `year` values (highest numeric values).
-- 2) Ensure users whose year is one of those 3 remain enabled (disabled = false).
-- 3) For users whose year is NOT in those 3 latest years AND who are not admins (role != 'admin'):
--    - copy their rows to an archive table (council_users_archive) to preserve history
--    - delete them from council_users
-- Notes:
-- - Admin users are preserved regardless of year (change logic if you want different behavior).
-- - Run this function after a new batch of users/years are inserted, or schedule it as a daily cron job.
-- - Make sure SUPABASE (or Postgres) has permissions to create tables if you want the function to create the archive table automatically.
-- - Review/archive policy before using in production; test on a staging DB.

-- Ensure pgcrypto (for gen_random_uuid) is available if you rely on it for new rows; most Supabase projects have it.
-- Create archive table if it doesn't exist (schema mirrors council_users)
create table if not exists council_users_archive (
  id uuid primary key,
  auth_uid uuid,
  full_name text not null,
  student_id varchar(10) not null,
  year int not null,
  role text default 'member',
  approved boolean default false,
  disabled boolean default false,
  created_at timestamptz default now()
);

-- helpful indexes on archive
create index if not exists council_users_archive_student_id_idx on council_users_archive(student_id);
create index if not exists council_users_archive_auth_uid_idx on council_users_archive(auth_uid);

-- The retention function
create or replace function council_enforce_three_latest_years()
returns void language plpgsql as
$$
declare
  keep_years int[]; -- array of up-to-3 latest years to keep
begin
  -- Build array of up-to-3 distinct years ordered descending (latest first)
  select array_agg(year) into keep_years
  from (
    select distinct year
    from council_users
    order by year desc
    limit 3
  ) sub;

  -- If there are no years (no users), nothing to do
  if keep_years is null then
    return;
  end if;

  -- Mark rows belonging to the kept years as enabled (disabled = false)
  update council_users
  set disabled = false
  where year = any (keep_years);

  --
  -- Identify rows to archive/delete:
  --   rows where year is not in keep_years AND role != 'admin'
  -- (We preserve admin accounts regardless of year.)
  --

  -- Insert those rows into archive table (avoid duplicates by id)
  insert into council_users_archive (id, auth_uid, full_name, student_id, year, role, approved, disabled, created_at)
  select id, auth_uid, full_name, student_id, year, role, approved, disabled, created_at
  from council_users
  where (year is null OR NOT (year = any (keep_years)))
    and coalesce(role, '') <> 'admin'
  on conflict (id) do nothing;

  -- Delete archived rows from primary table
  delete from council_users
  where (year is null OR NOT (year = any (keep_years)))
    and coalesce(role, '') <> 'admin';

  return;
end;
$$;

-- Convenience wrapper to run and then return the current kept years (optional)
create or replace function council_enforce_three_latest_years_and_report()
returns table(kept_years int[]) language plpgsql as
$$
begin
  perform council_enforce_three_latest_years();
  return query
    select array_agg(distinct year order by year desc) as kept_years
    from council_users
    limit 1;
end;
$$;

-- Example usage:
-- SELECT council_enforce_three_latest_years();         -- run retention enforcement
-- SELECT * FROM council_enforce_three_latest_years_and_report(); -- run + get kept years

-- Scheduling:
-- On Supabase, you can schedule the function using pg_cron (if available on your plan)
-- or by creating a scheduled function using Supabase's "Database > Scheduled Functions" feature.
-- Example pg_cron entry (if pg_cron installed):
-- SELECT cron.schedule('0 3 * * *', 'SELECT council_enforce_three_latest_years();');
--
-- NOTE: Test these operations on a staging DB before enabling on production.
-- If you prefer to mark older accounts disabled (instead of deleting), replace the delete block with:
--   update council_users set disabled = true
--   where (year is null OR NOT (year = any (keep_years))) and coalesce(role,'') <> 'admin';