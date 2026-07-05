import datetime

from flask import Blueprint, jsonify, request

from db import get_connection, get_cursor

# Nome file "statistics_api" (non "statistics") per non oscurare il modulo
# statistics della libreria standard di Python.
statistics_bp = Blueprint("statistics", __name__)

PERIOD_DAYS = {
    "month": 30,
    "3months": 90,
    "year": 365,
}


def _period_start(period):
    days = PERIOD_DAYS.get(period)
    if days is None:
        return None
    return datetime.date.today() - datetime.timedelta(days=days)


@statistics_bp.route("/api/statistics")
def get_statistics():
    period = request.args.get("period", "all")
    start_date = _period_start(period)

    date_filter = "COALESCE(b.due_date, b.created_at::date) >= %s" if start_date else "TRUE"
    params = [start_date] if start_date else []

    conn = get_connection()
    try:
        with get_cursor(conn) as cur:
            cur.execute("SELECT id, name FROM roommates ORDER BY id")
            roommates = cur.fetchall()

            cur.execute(
                f"""
                SELECT bs.roommate_id, SUM(bs.amount_due) AS total
                FROM bill_splits bs
                JOIN bills b ON b.id = bs.bill_id
                WHERE bs.paid = FALSE AND {date_filter}
                GROUP BY bs.roommate_id
                """,
                params,
            )
            outstanding_by_roommate = {row["roommate_id"]: float(row["total"]) for row in cur.fetchall()}
            total_outstanding_by_roommate = [
                {
                    "roommate_id": r["id"],
                    "name": r["name"],
                    "amount": outstanding_by_roommate.get(r["id"], 0.0),
                }
                for r in roommates
            ]
            total_outstanding = sum(outstanding_by_roommate.values())

            cur.execute(
                f"""
                SELECT b.category, SUM(b.amount_total) AS total
                FROM bills b
                WHERE {date_filter}
                GROUP BY b.category
                ORDER BY total DESC
                """,
                params,
            )
            by_category = [{"category": row["category"], "total": float(row["total"])} for row in cur.fetchall()]

            cur.execute(
                f"""
                SELECT to_char(COALESCE(b.due_date, b.created_at::date), 'YYYY-MM') AS month,
                       SUM(b.amount_total) AS total
                FROM bills b
                WHERE {date_filter}
                GROUP BY month
                ORDER BY month ASC
                """,
                params,
            )
            monthly_trend = [{"month": row["month"], "total": float(row["total"])} for row in cur.fetchall()]

            cur.execute(
                f"""
                SELECT b.paid_by AS roommate_id, SUM(b.amount_total) AS total
                FROM bills b
                WHERE {date_filter}
                GROUP BY b.paid_by
                """,
                params,
            )
            paid_by_map = {row["roommate_id"]: float(row["total"]) for row in cur.fetchall()}
            paid_by_roommate = [
                {"roommate_id": r["id"], "name": r["name"], "total": paid_by_map.get(r["id"], 0.0)}
                for r in roommates
            ]

        return jsonify(
            {
                "period": period,
                "total_outstanding": total_outstanding,
                "total_outstanding_by_roommate": total_outstanding_by_roommate,
                "by_category": by_category,
                "monthly_trend": monthly_trend,
                "paid_by_roommate": paid_by_roommate,
            }
        )
    finally:
        conn.close()
