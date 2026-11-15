/**
 * Ordered list of schema migrations. Index = version - 1.
 * Never edit an existing entry once released – append a new one instead.
 */
export const MIGRATIONS: string[] = [
  /* v1 – accounts, players, resources, upgrades, ledger */ `
  CREATE TABLE accounts (
    id            INTEGER PRIMARY KEY,
    username      TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT    NOT NULL,
    created_at    INTEGER NOT NULL
  );

  CREATE TABLE sessions (
    token_hash TEXT    PRIMARY KEY,
    account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );
  CREATE INDEX sessions_account ON sessions(account_id);

  CREATE TABLE players (
    account_id   INTEGER PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
    name         TEXT    NOT NULL,
    level        INTEGER NOT NULL DEFAULT 1,
    xp           INTEGER NOT NULL DEFAULT 0,
    credits      INTEGER NOT NULL DEFAULT 0 CHECK (credits >= 0),
    ship_class   TEXT    NOT NULL,
    map_id       TEXT    NOT NULL,
    x            REAL    NOT NULL DEFAULT 0,
    y            REAL    NOT NULL DEFAULT 0,
    hull         REAL,
    shield       REAL,
    kills        INTEGER NOT NULL DEFAULT 0,
    deaths       INTEGER NOT NULL DEFAULT 0,
    created_at   INTEGER NOT NULL,
    last_seen_at INTEGER NOT NULL
  );

  -- Resource balances. location = 'storage' (safe, station) or 'cargo' (in the ship's hold).
  CREATE TABLE player_resources (
    account_id  INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    location    TEXT    NOT NULL CHECK (location IN ('storage', 'cargo')),
    resource_id TEXT    NOT NULL,
    amount      INTEGER NOT NULL CHECK (amount >= 0),
    PRIMARY KEY (account_id, location, resource_id)
  );

  CREATE TABLE player_upgrades (
    account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    track      TEXT    NOT NULL,
    level      INTEGER NOT NULL CHECK (level >= 0),
    PRIMARY KEY (account_id, track)
  );

  -- Append-only economic audit log. Every change of credits or stored resources is recorded.
  CREATE TABLE ledger (
    id            INTEGER PRIMARY KEY,
    account_id    INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    asset         TEXT    NOT NULL,           -- 'credits' or a resource id
    location      TEXT    NOT NULL,           -- 'wallet' | 'storage' | 'cargo'
    delta         INTEGER NOT NULL,
    balance_after INTEGER NOT NULL,
    reason        TEXT    NOT NULL,
    created_at    INTEGER NOT NULL
  );
  CREATE INDEX ledger_account ON ledger(account_id, created_at);
  `,
];
