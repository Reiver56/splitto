import json

from pywebpush import WebPushException, webpush

from config import Config
from db import get_connection, get_cursor


def save_subscription(roommate_id, subscription_info):
    endpoint = subscription_info["endpoint"]
    keys = subscription_info["keys"]
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO push_subscriptions (roommate_id, endpoint, p256dh, auth)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (endpoint) DO UPDATE
                    SET roommate_id = EXCLUDED.roommate_id,
                        p256dh = EXCLUDED.p256dh,
                        auth = EXCLUDED.auth
                """,
                (roommate_id, endpoint, keys["p256dh"], keys["auth"]),
            )
        conn.commit()
    finally:
        conn.close()


def _subscriptions_for_roommate(conn, roommate_id):
    with get_cursor(conn) as cur:
        cur.execute(
            "SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE roommate_id = %s",
            (roommate_id,),
        )
        return cur.fetchall()


def _delete_subscription(conn, subscription_id):
    with conn.cursor() as cur:
        cur.execute("DELETE FROM push_subscriptions WHERE id = %s", (subscription_id,))
    conn.commit()


def send_push_to_roommate(roommate_id, payload: dict):
    """Invia una notifica push a tutti i dispositivi registrati di un coinquilino."""
    if not Config.VAPID_PUBLIC_KEY:
        return

    conn = get_connection()
    try:
        subscriptions = _subscriptions_for_roommate(conn, roommate_id)
        for sub in subscriptions:
            subscription_info = {
                "endpoint": sub["endpoint"],
                "keys": {"p256dh": sub["p256dh"], "auth": sub["auth"]},
            }
            try:
                webpush(
                    subscription_info=subscription_info,
                    data=json.dumps(payload),
                    vapid_private_key=Config.VAPID_PRIVATE_KEY_FILE,
                    vapid_claims={"sub": Config.VAPID_CLAIM_EMAIL},
                )
            except WebPushException as ex:
                status_code = getattr(ex.response, "status_code", None)
                if status_code in (404, 410):
                    _delete_subscription(conn, sub["id"])
                else:
                    print(f"Errore invio push a roommate {roommate_id}: {ex}")
    finally:
        conn.close()
