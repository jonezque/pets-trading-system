-- Pets Trading System schema.
-- Money is stored as NUMERIC to avoid floating-point drift.

CREATE TABLE IF NOT EXISTS pet_dictionary (
  id                SERIAL PRIMARY KEY,
  type              TEXT    NOT NULL,           -- dog | cat | bird | fish
  breed             TEXT    NOT NULL UNIQUE,
  lifespan          NUMERIC NOT NULL,           -- years
  desirability_base NUMERIC NOT NULL,           -- 1-10 scale
  maintenance       NUMERIC NOT NULL,
  base_price        NUMERIC NOT NULL
);

CREATE TABLE IF NOT EXISTS traders (
  id   SERIAL PRIMARY KEY,
  name TEXT    NOT NULL UNIQUE,
  cash NUMERIC NOT NULL                          -- total owned cash (locked is derived from active bids)
);

CREATE TABLE IF NOT EXISTS supply (
  breed_id  INTEGER PRIMARY KEY REFERENCES pet_dictionary(id),
  remaining INTEGER NOT NULL CHECK (remaining >= 0)
);

CREATE TABLE IF NOT EXISTS pets (
  id           SERIAL PRIMARY KEY,
  breed_id     INTEGER NOT NULL REFERENCES pet_dictionary(id),
  owner_id     INTEGER NOT NULL REFERENCES traders(id),
  age_years    NUMERIC NOT NULL DEFAULT 0,
  health_pct   NUMERIC NOT NULL DEFAULT 100,
  desirability NUMERIC NOT NULL,                 -- per-instance, fluctuates over time
  status       TEXT    NOT NULL DEFAULT 'active' CHECK (status IN ('active','expired')),
  born_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS listings (
  id           SERIAL PRIMARY KEY,
  pet_id       INTEGER NOT NULL REFERENCES pets(id),
  seller_id    INTEGER NOT NULL REFERENCES traders(id),
  asking_price NUMERIC NOT NULL CHECK (asking_price > 0),
  status       TEXT    NOT NULL DEFAULT 'active' CHECK (status IN ('active','withdrawn','sold')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Only ONE active listing per pet.
CREATE UNIQUE INDEX IF NOT EXISTS one_active_listing_per_pet
  ON listings (pet_id) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS bids (
  id         SERIAL PRIMARY KEY,
  listing_id INTEGER NOT NULL REFERENCES listings(id),
  bidder_id  INTEGER NOT NULL REFERENCES traders(id),
  amount     NUMERIC NOT NULL CHECK (amount > 0),
  status     TEXT    NOT NULL DEFAULT 'active'
             CHECK (status IN ('active','outbid','rejected','withdrawn','accepted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Only ONE active bid per listing (the current highest).
CREATE UNIQUE INDEX IF NOT EXISTS one_active_bid_per_listing
  ON bids (listing_id) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS trades (
  id          SERIAL PRIMARY KEY,
  pet_id      INTEGER NOT NULL REFERENCES pets(id),
  seller_id   INTEGER REFERENCES traders(id),   -- NULL for retail (from supply)
  buyer_id    INTEGER NOT NULL REFERENCES traders(id),
  price       NUMERIC NOT NULL,
  kind        TEXT    NOT NULL CHECK (kind IN ('retail','secondary')),
  executed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notifications (
  id              SERIAL PRIMARY KEY,
  trader_id       INTEGER NOT NULL REFERENCES traders(id),
  kind            TEXT    NOT NULL,              -- received|accepted|rejected|withdrawn|outbid|highest
  pet_id          INTEGER REFERENCES pets(id),
  price           NUMERIC,
  counterparty_id INTEGER REFERENCES traders(id),
  message         TEXT    NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_trader ON notifications (trader_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pets_owner ON pets (owner_id);
