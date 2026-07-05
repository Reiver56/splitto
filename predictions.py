from flask import Blueprint, jsonify

from db import get_connection, get_cursor

predictions_bp = Blueprint("predictions", __name__)

MIN_HISTORY = 3
MAX_WINDOW = 6
TREND_FLAT_THRESHOLD = 0.5


def _weighted_moving_average(amounts):
    """Media mobile pesata sugli ultimi valori: i piu' recenti pesano di piu'."""
    window = amounts[-MAX_WINDOW:]
    weights = list(range(1, len(window) + 1))
    weighted_sum = sum(a * w for a, w in zip(window, weights))
    return weighted_sum / sum(weights)


def _linear_trend_slope(amounts):
    """Pendenza di una regressione lineare (least squares) su indice -> importo."""
    n = len(amounts)
    xs = list(range(n))
    mean_x = sum(xs) / n
    mean_y = sum(amounts) / n
    numerator = sum((x - mean_x) * (y - mean_y) for x, y in zip(xs, amounts))
    denominator = sum((x - mean_x) ** 2 for x in xs)
    if denominator == 0:
        return 0.0
    return numerator / denominator


@predictions_bp.route("/api/predictions")
def get_predictions():
    conn = get_connection()
    try:
        with get_cursor(conn) as cur:
            cur.execute("SELECT DISTINCT category FROM bills ORDER BY category")
            categories = [row["category"] for row in cur.fetchall()]

            results = []
            for category in categories:
                cur.execute(
                    """
                    SELECT COALESCE(due_date, created_at::date) AS date, amount_total
                    FROM bills
                    WHERE category = %s
                    ORDER BY COALESCE(due_date, created_at::date) ASC
                    """,
                    (category,),
                )
                rows = cur.fetchall()
                history = [{"date": r["date"], "amount": float(r["amount_total"])} for r in rows]

                if len(history) < MIN_HISTORY:
                    results.append(
                        {
                            "category": category,
                            "insufficient_data": True,
                            "count": len(history),
                            "history": history,
                        }
                    )
                    continue

                amounts = [h["amount"] for h in history]
                predicted = round(_weighted_moving_average(amounts), 2)
                slope = _linear_trend_slope(amounts)

                if abs(slope) < TREND_FLAT_THRESHOLD:
                    trend = "stabile"
                elif slope > 0:
                    trend = "in aumento"
                else:
                    trend = "in calo"

                results.append(
                    {
                        "category": category,
                        "insufficient_data": False,
                        "count": len(history),
                        "predicted_amount": predicted,
                        "trend": trend,
                        "history": history,
                    }
                )

        return jsonify(results)
    finally:
        conn.close()
