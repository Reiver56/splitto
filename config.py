import os

from dotenv import load_dotenv

load_dotenv()

BASE_DIR = os.path.dirname(os.path.abspath(__file__))


class Config:
    DATABASE_URL = os.environ.get("DATABASE_URL")
    DB_HOST = os.environ.get("DB_HOST", "localhost")
    DB_PORT = os.environ.get("DB_PORT", "5432")
    DB_NAME = os.environ.get("DB_NAME", "splitto")
    DB_USER = os.environ.get("DB_USER", "splitto")
    DB_PASSWORD = os.environ.get("DB_PASSWORD", "splitto")

    VAPID_PUBLIC_KEY = os.environ.get("VAPID_PUBLIC_KEY", "")
    VAPID_PRIVATE_KEY_FILE = os.path.join(
        BASE_DIR, os.environ.get("VAPID_PRIVATE_KEY_FILE", "vapid_private_key.pem")
    )
    VAPID_CLAIM_EMAIL = os.environ.get("VAPID_CLAIM_EMAIL", "mailto:admin@example.com")

    FLASK_PORT = int(os.environ.get("FLASK_PORT", "5000"))

    REMINDER_HOUR = int(os.environ.get("REMINDER_HOUR", "9"))
    REMINDER_MINUTE = int(os.environ.get("REMINDER_MINUTE", "0"))

    @classmethod
    def dsn(cls):
        if cls.DATABASE_URL:
            return cls.DATABASE_URL
        return (
            f"host={cls.DB_HOST} port={cls.DB_PORT} dbname={cls.DB_NAME} "
            f"user={cls.DB_USER} password={cls.DB_PASSWORD}"
        )
