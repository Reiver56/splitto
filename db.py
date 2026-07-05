import os

import psycopg2
import psycopg2.extras

from config import Config
from migrations import run_migrations

SCHEMA_PATH = os.path.join(os.path.dirname(__file__), "schema.sql")


def get_connection():
    conn = psycopg2.connect(Config.dsn())
    return conn


def get_cursor(conn):
    return conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)


def init_schema():
    with open(SCHEMA_PATH, "r", encoding="utf-8") as f:
        schema_sql = f.read()

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(schema_sql)
        conn.commit()
        run_migrations(conn)
    finally:
        conn.close()


if __name__ == "__main__":
    init_schema()
    print("Schema inizializzato correttamente.")
