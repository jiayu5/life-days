CREATE TABLE email_codes (
  email TEXT PRIMARY KEY NOT NULL,
  nonce TEXT NOT NULL,
  digest TEXT NOT NULL,
  issued_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE email_sessions (
  token_hash TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX email_sessions_expiry ON email_sessions (expires_at);
--> statement-breakpoint
CREATE TABLE email_quota (
  slot INTEGER PRIMARY KEY NOT NULL,
  sent INTEGER NOT NULL
);
