import os

MIGRATIONS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "migrations")


def run_migrations(conn):
    """Applica in ordine i file .sql in migrations/ non ancora registrati.

    Ogni file viene eseguito in transazione e registrato in schema_migrations,
    cosi' un'installazione gia' esistente puo' essere aggiornata senza
    riscrivere lo schema da zero.
    """
    with conn.cursor() as cur:
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS schema_migrations (
                filename TEXT PRIMARY KEY,
                applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
            """
        )
    conn.commit()

    if not os.path.isdir(MIGRATIONS_DIR):
        return

    with conn.cursor() as cur:
        cur.execute("SELECT filename FROM schema_migrations")
        applied = {row[0] for row in cur.fetchall()}

    pending = sorted(
        f for f in os.listdir(MIGRATIONS_DIR) if f.endswith(".sql") and f not in applied
    )

    for filename in pending:
        path = os.path.join(MIGRATIONS_DIR, filename)
        with open(path, "r", encoding="utf-8") as f:
            sql = f.read()

        with conn.cursor() as cur:
            cur.execute(sql)
            cur.execute("INSERT INTO schema_migrations (filename) VALUES (%s)", (filename,))
        conn.commit()
        print(f"Migrazione applicata: {filename}")
