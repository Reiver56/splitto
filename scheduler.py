from apscheduler.schedulers.background import BackgroundScheduler

from bills import spawn_next_occurrence
from config import Config
from db import get_connection, get_cursor
from push import send_push_to_roommate

_scheduler = None


def check_and_send_reminders():
    """Cerca bollette in scadenza entro 3 giorni con quote non saldate e non ancora
    notificate, invia un promemoria push e marca la bolletta come notificata."""
    conn = get_connection()
    try:
        with get_cursor(conn) as cur:
            cur.execute(
                """
                SELECT id, description, due_date, amount_total
                FROM bills
                WHERE reminder_sent = FALSE
                  AND due_date IS NOT NULL
                  AND due_date >= CURRENT_DATE
                  AND due_date <= CURRENT_DATE + INTERVAL '3 days'
                  AND EXISTS (
                      SELECT 1 FROM bill_splits bs
                      WHERE bs.bill_id = bills.id AND bs.paid = FALSE
                  )
                """
            )
            due_bills = cur.fetchall()

            for bill in due_bills:
                cur.execute(
                    """
                    SELECT roommate_id, amount_due
                    FROM bill_splits
                    WHERE bill_id = %s AND paid = FALSE
                    """,
                    (bill["id"],),
                )
                unpaid_splits = cur.fetchall()

                for split in unpaid_splits:
                    send_push_to_roommate(
                        split["roommate_id"],
                        {
                            "title": "Promemoria bolletta in scadenza",
                            "body": (
                                f"{bill['description']}: devi {split['amount_due']} EUR, "
                                f"scadenza {bill['due_date'].strftime('%d/%m/%Y')}"
                            ),
                            "tag": f"reminder-{bill['id']}",
                        },
                    )

        with conn.cursor() as cur:
            cur.execute(
                "UPDATE bills SET reminder_sent = TRUE WHERE id = ANY(%s)",
                ([b["id"] for b in due_bills],),
            )
        conn.commit()
    finally:
        conn.close()


def spawn_due_recurring_bills():
    """Genera la prossima occorrenza delle bollette ricorrenti la cui scadenza e'
    passata senza mai essere stata saldata (l'altro trigger, il saldo completo,
    e' gestito direttamente in bills.py al momento del toggle di una quota)."""
    conn = get_connection()
    try:
        with get_cursor(conn) as cur:
            cur.execute(
                """
                SELECT id FROM bills
                WHERE is_recurring = TRUE
                  AND recurrence_spawned = FALSE
                  AND due_date IS NOT NULL
                  AND due_date < CURRENT_DATE
                """
            )
            due_bill_ids = [row["id"] for row in cur.fetchall()]

            for bill_id in due_bill_ids:
                spawn_next_occurrence(cur, bill_id)
        conn.commit()
    finally:
        conn.close()


def start_scheduler():
    global _scheduler
    if _scheduler is not None:
        return _scheduler

    _scheduler = BackgroundScheduler()
    _scheduler.add_job(
        check_and_send_reminders,
        trigger="cron",
        hour=Config.REMINDER_HOUR,
        minute=Config.REMINDER_MINUTE,
        id="daily_bill_reminders",
    )
    _scheduler.add_job(
        spawn_due_recurring_bills,
        trigger="cron",
        hour=Config.REMINDER_HOUR,
        minute=Config.REMINDER_MINUTE,
        id="daily_recurring_bill_spawn",
    )
    _scheduler.start()
    return _scheduler
