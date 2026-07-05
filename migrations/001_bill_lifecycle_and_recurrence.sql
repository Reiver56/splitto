-- Aggiunge il supporto per bollette ricorrenti.
-- Lo stato del ciclo di vita (da pagare / in scadenza / scaduta / saldata) resta
-- calcolato al volo dal backend: non serve una colonna "status" da tenere sincronizzata.

ALTER TABLE bills ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS recurrence_frequency TEXT;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS recurrence_spawned BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS recurrence_parent_id INTEGER REFERENCES bills(id);

CREATE INDEX IF NOT EXISTS idx_bills_recurring_pending
    ON bills(is_recurring, recurrence_spawned)
    WHERE is_recurring = TRUE AND recurrence_spawned = FALSE;
