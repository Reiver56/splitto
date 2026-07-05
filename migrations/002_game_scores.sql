-- Punteggi del minigioco giornaliero (puzzle "Zip"): un tentativo per coinquilino al giorno.

CREATE TABLE IF NOT EXISTS game_scores (
    id SERIAL PRIMARY KEY,
    roommate_id INTEGER NOT NULL REFERENCES roommates(id),
    game_date DATE NOT NULL,
    elapsed_ms INTEGER NOT NULL,
    moves INTEGER NOT NULL,
    score INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (roommate_id, game_date)
);

CREATE INDEX IF NOT EXISTS idx_game_scores_game_date ON game_scores(game_date);
