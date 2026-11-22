CREATE TABLE members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT NOT NULL UNIQUE,
  plan TEXT NOT NULL DEFAULT 'Basic',
  batch TEXT NOT NULL DEFAULT 'Evening',
  start_date TEXT NOT NULL,          -- YYYY-MM-DD (India time)
  end_date TEXT NOT NULL,            -- last valid day, YYYY-MM-DD
  pin TEXT NOT NULL,                 -- 4-digit login PIN
  token TEXT NOT NULL UNIQUE,        -- secret for the one-tap login link
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE attendance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  check_in TEXT NOT NULL,            -- ISO UTC
  check_out TEXT                     -- ISO UTC, NULL while inside
);
CREATE INDEX att_member ON attendance(member_id, check_in);
CREATE INDEX att_in ON attendance(check_in);
CREATE TABLE payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  months INTEGER NOT NULL,
  plan TEXT NOT NULL,
  paid_on TEXT NOT NULL,             -- YYYY-MM-DD
  note TEXT NOT NULL DEFAULT ''
);
CREATE INDEX pay_member ON payments(member_id);
CREATE TABLE failed_logins (
  key TEXT NOT NULL,                 -- ip or phone
  at TEXT NOT NULL                   -- ISO UTC
);
CREATE INDEX fail_key ON failed_logins(key, at);
