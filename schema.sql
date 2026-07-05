-- Schema del database per Splitto (gestione bollette condivise tra coinquilini)

CREATE TABLE IF NOT EXISTS roommates (
    id SERIAL PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bills (
    id SERIAL PRIMARY KEY,
    description TEXT NOT NULL,
    amount_total NUMERIC(10, 2) NOT NULL,
    category TEXT NOT NULL DEFAULT 'altro',
    due_date DATE,
    paid_by INTEGER NOT NULL REFERENCES roommates(id),
    notes TEXT,
    reminder_sent BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bill_splits (
    id SERIAL PRIMARY KEY,
    bill_id INTEGER NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
    roommate_id INTEGER NOT NULL REFERENCES roommates(id),
    amount_due NUMERIC(10, 2) NOT NULL,
    paid BOOLEAN NOT NULL DEFAULT FALSE,
    paid_at TIMESTAMPTZ,
    UNIQUE (bill_id, roommate_id)
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
    id SERIAL PRIMARY KEY,
    roommate_id INTEGER NOT NULL REFERENCES roommates(id),
    endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bill_splits_bill_id ON bill_splits(bill_id);
CREATE INDEX IF NOT EXISTS idx_bill_splits_roommate_id ON bill_splits(roommate_id);
CREATE INDEX IF NOT EXISTS idx_bills_due_date ON bills(due_date);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_roommate_id ON push_subscriptions(roommate_id);
