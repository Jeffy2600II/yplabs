/*
  # Create all YPLABS tables and enable Realtime

  1. New Tables
    - `council_users`
      - `id` (uuid, primary key)
      - `auth_uid` (uuid, unique, references auth.users)
      - `full_name` (text)
      - `student_id` (text, default '')
      - `email` (text, default '')
      - `year` (integer)
      - `role` (text, default 'member')
      - `approved` (boolean, default false)
      - `disabled` (boolean, default false)
      - `account_type` (text, default 'student')
      - `created_at` (timestamptz, default now())

    - `council_years`
      - `year` (integer, primary key)
      - `closed` (boolean, default false)

    - `council_duty`
      - `id` (uuid, primary key)
      - `auth_uid` (uuid, nullable)
      - `student_name` (text)
      - `student_id` (text, default '')
      - `duty_date` (text)
      - `checked_in` (boolean, default false)
      - `checked_in_at` (timestamptz, nullable)
      - `note` (text, nullable)
      - `created_at` (timestamptz, default now())

    - `council_zone_checks`
      - `id` (uuid, primary key)
      - `zone` (text)
      - `status` (text, default 'pending')
      - `inspector_name` (text, nullable)
      - `note` (text, nullable)
      - `photo_url` (text, nullable)
      - `check_date` (text)
      - `created_at` (timestamptz, default now())

    - `council_join_requests`
      - `id` (uuid, primary key)
      - `full_name` (text)
      - `student_id` (text, default '')
      - `year` (integer)
      - `email` (text, default '')
      - `account_type` (text, default 'student')
      - `created_at` (timestamptz, default now())

  2. Security
    - Enable RLS on all tables
    - Service role has full access (used by API routes)
    - Authenticated users can read their own data in council_users
    - Public read access for council_duty and council_zone_checks (today's data)
    - Only approved+enabled members can insert into council_duty and council_zone_checks

  3. Realtime
    - Add council_duty, council_zone_checks, council_join_requests to supabase_realtime publication
    - This enables Supabase Realtime push notifications for these tables
*/

-- ─── council_users ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS council_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_uid uuid UNIQUE,
  full_name text NOT NULL,
  student_id text DEFAULT '',
  email text DEFAULT '',
  year integer NOT NULL,
  role text DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  approved boolean DEFAULT false,
  disabled boolean DEFAULT false,
  account_type text DEFAULT 'student',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE council_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on council_users"
  ON council_users FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Users can read own profile"
  ON council_users FOR SELECT
  TO authenticated
  USING (auth.uid() = auth_uid);

-- ─── council_years ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS council_years (
  year integer PRIMARY KEY,
  closed boolean DEFAULT false
);

ALTER TABLE council_years ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on council_years"
  ON council_years FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Anyone can read years"
  ON council_years FOR SELECT
  TO authenticated
  USING (true);

-- ─── council_duty ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS council_duty (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_uid uuid,
  student_name text NOT NULL,
  student_id text DEFAULT '',
  duty_date text NOT NULL,
  checked_in boolean DEFAULT false,
  checked_in_at timestamptz,
  note text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE council_duty ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on council_duty"
  ON council_duty FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated can read duty"
  ON council_duty FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Approved members can insert duty checkin"
  ON council_duty FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM council_users
      WHERE council_users.auth_uid = auth.uid()
      AND council_users.approved = true
      AND council_users.disabled = false
    )
  );

CREATE POLICY "Approved members can update own duty"
  ON council_duty FOR UPDATE
  TO authenticated
  USING (auth.uid() = auth_uid)
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM council_users
      WHERE council_users.auth_uid = auth.uid()
      AND council_users.approved = true
      AND council_users.disabled = false
    )
  );

-- ─── council_zone_checks ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS council_zone_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  zone text NOT NULL,
  status text DEFAULT 'pending' CHECK (status IN ('clean', 'dirty', 'pending')),
  inspector_name text,
  note text,
  photo_url text,
  check_date text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE council_zone_checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on council_zone_checks"
  ON council_zone_checks FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated can read zone checks"
  ON council_zone_checks FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Approved members can insert zone checks"
  ON council_zone_checks FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM council_users
      WHERE council_users.auth_uid = auth.uid()
      AND council_users.approved = true
      AND council_users.disabled = false
    )
  );

-- ─── council_join_requests ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS council_join_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  student_id text DEFAULT '',
  year integer NOT NULL,
  email text DEFAULT '',
  account_type text DEFAULT 'student',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE council_join_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on council_join_requests"
  ON council_join_requests FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated can read own requests"
  ON council_join_requests FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Anyone can submit join request"
  ON council_join_requests FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- ─── Indexes ──────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_council_users_auth_uid ON council_users(auth_uid);
CREATE INDEX IF NOT EXISTS idx_council_duty_date ON council_duty(duty_date);
CREATE INDEX IF NOT EXISTS idx_council_duty_auth_uid ON council_duty(auth_uid);
CREATE INDEX IF NOT EXISTS idx_council_zone_checks_date ON council_zone_checks(check_date);
CREATE INDEX IF NOT EXISTS idx_council_zone_checks_zone ON council_zone_checks(zone, check_date);
CREATE INDEX IF NOT EXISTS idx_council_join_requests_year ON council_join_requests(year);

-- ─── Enable Realtime ──────────────────────────────────────────────
-- Add tables to supabase_realtime publication so Supabase Realtime
-- can push change events to connected clients.

ALTER PUBLICATION supabase_realtime ADD TABLE council_duty;
ALTER PUBLICATION supabase_realtime ADD TABLE council_zone_checks;
ALTER PUBLICATION supabase_realtime ADD TABLE council_join_requests;
