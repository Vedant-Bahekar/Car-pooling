-- =============================================================
-- School Ride Tracker — Supabase Database Setup
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor > New query)
-- =============================================================

-- 1. Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Tables
-- ---------

CREATE TABLE riders (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE rates (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  from_date  DATE NOT NULL,
  rate       INTEGER NOT NULL CHECK (rate >= 0),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE attendance (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  rider_id   UUID NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  date       DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(rider_id, date)
);

CREATE TABLE payments (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  rider_id   UUID NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  week       DATE NOT NULL,           -- Monday of the week this payment belongs to
  date       DATE NOT NULL,           -- actual date the payment was made
  amount     INTEGER NOT NULL CHECK (amount > 0),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE pin_attempts (
  ip            TEXT PRIMARY KEY,
  attempts      INTEGER DEFAULT 0,
  locked_until  TIMESTAMPTZ,
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- 3. Default data
-- ----------------

INSERT INTO riders (name) VALUES ('Kavita'), ('Yoginee'), ('Jija');
INSERT INTO rates (from_date, rate) VALUES ('0001-01-01', 150);

-- 4. Row-Level Security
-- ----------------------
-- Public can READ rider/rate/attendance/payment data.
-- Only service_role (used by the API) can WRITE.

ALTER TABLE riders      ENABLE ROW LEVEL SECURITY;
ALTER TABLE rates       ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance  ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments    ENABLE ROW LEVEL SECURITY;
ALTER TABLE pin_attempts ENABLE ROW LEVEL SECURITY;

-- Allow public (anon) reads on data tables
CREATE POLICY "anon_select_riders"     ON riders     FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_select_rates"      ON rates      FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_select_attendance" ON attendance  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_select_payments"   ON payments    FOR SELECT TO anon, authenticated USING (true);

-- No INSERT / UPDATE / DELETE policies for anon — writes are blocked.
-- pin_attempts has NO select policy for anon — completely hidden.
-- The serverless API uses the service_role key which bypasses RLS.
