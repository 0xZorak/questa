-- Migration 003: email_subscribers table
-- Run in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS email_subscribers (
  id         bigserial PRIMARY KEY,
  email      text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Allow anonymous inserts (the footer subscribe form uses the anon key)
ALTER TABLE email_subscribers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "email_subscribers_insert_all" ON email_subscribers
  FOR INSERT WITH CHECK (true);

CREATE POLICY "email_subscribers_select_all" ON email_subscribers
  FOR SELECT USING (true);
