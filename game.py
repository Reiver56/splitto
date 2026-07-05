from flask import Blueprint, jsonify, request

from db import get_connection, get_cursor

game_bp = Blueprint("game", __name__)

MIN_GRID_CELLS = 9
MAX_GRID_CELLS = 100
MAX_ELAPSED_MS = 24 * 60 * 60 * 1000
MOVE_PENALTY_PER_EXTRA_MOVE = 15


def _compute_score(elapsed_ms, moves, grid_cells):
    elapsed_seconds = elapsed_ms / 1000
    move_penalty = max(0, moves - grid_cells) * MOVE_PENALTY_PER_EXTRA_MOVE
    return max(0, round(1000 - elapsed_seconds - move_penalty))


@game_bp.route("/api/game/status")
def game_status():
    roommate_id = request.args.get("roommate_id", type=int)
    if not roommate_id:
        return jsonify({"error": "roommate_id mancante."}), 400

    conn = get_connection()
    try:
        with get_cursor(conn) as cur:
            cur.execute(
                """
                SELECT elapsed_ms, moves, score
                FROM game_scores
                WHERE roommate_id = %s AND game_date = CURRENT_DATE
                """,
                (roommate_id,),
            )
            today_score = cur.fetchone()

        return jsonify({"played_today": today_score is not None, "today_score": today_score})
    finally:
        conn.close()


@game_bp.route("/api/game/scores", methods=["POST"])
def submit_score():
    data = request.get_json(force=True) or {}

    try:
        roommate_id = int(data.get("roommate_id"))
        elapsed_ms = int(data.get("elapsed_ms"))
        moves = int(data.get("moves"))
        grid_cells = int(data.get("grid_cells"))
    except (TypeError, ValueError):
        return jsonify({"error": "Dati del punteggio non validi."}), 400

    if not (0 < elapsed_ms <= MAX_ELAPSED_MS):
        return jsonify({"error": "Tempo impiegato non valido."}), 400
    if moves < 0:
        return jsonify({"error": "Numero di mosse non valido."}), 400
    if not (MIN_GRID_CELLS <= grid_cells <= MAX_GRID_CELLS):
        return jsonify({"error": "Dimensione griglia non valida."}), 400

    score = _compute_score(elapsed_ms, moves, grid_cells)

    conn = get_connection()
    try:
        with get_cursor(conn) as cur:
            cur.execute(
                """
                INSERT INTO game_scores (roommate_id, game_date, elapsed_ms, moves, score)
                VALUES (%s, CURRENT_DATE, %s, %s, %s)
                ON CONFLICT (roommate_id, game_date) DO NOTHING
                RETURNING id, elapsed_ms, moves, score
                """,
                (roommate_id, elapsed_ms, moves, score),
            )
            inserted = cur.fetchone()
        conn.commit()

        if not inserted:
            return jsonify({"error": "Hai gia' giocato oggi."}), 409
        return jsonify(inserted), 201
    finally:
        conn.close()


@game_bp.route("/api/game/leaderboard")
def leaderboard():
    period = request.args.get("period", "today")

    conn = get_connection()
    try:
        with get_cursor(conn) as cur:
            cur.execute("SELECT id, name FROM roommates ORDER BY id")
            roommates = cur.fetchall()

            if period == "today":
                cur.execute(
                    "SELECT roommate_id, score, elapsed_ms, moves FROM game_scores WHERE game_date = CURRENT_DATE"
                )
                rows = {row["roommate_id"]: row for row in cur.fetchall()}
                entries = [
                    {
                        "roommate_id": r["id"],
                        "name": r["name"],
                        "played": r["id"] in rows,
                        "score": rows[r["id"]]["score"] if r["id"] in rows else None,
                        "elapsed_ms": rows[r["id"]]["elapsed_ms"] if r["id"] in rows else None,
                        "moves": rows[r["id"]]["moves"] if r["id"] in rows else None,
                    }
                    for r in roommates
                ]
                entries.sort(key=lambda e: (e["score"] is None, -(e["score"] or 0)))
            else:
                date_filter = "AND game_date >= CURRENT_DATE - INTERVAL '7 days'" if period == "week" else ""
                cur.execute(
                    f"""
                    SELECT roommate_id, SUM(score) AS total_score, COUNT(*) AS games_played,
                           MIN(elapsed_ms) AS best_time_ms
                    FROM game_scores
                    WHERE TRUE {date_filter}
                    GROUP BY roommate_id
                    """
                )
                rows = {row["roommate_id"]: row for row in cur.fetchall()}
                entries = [
                    {
                        "roommate_id": r["id"],
                        "name": r["name"],
                        "total_score": int(rows[r["id"]]["total_score"]) if r["id"] in rows else 0,
                        "games_played": rows[r["id"]]["games_played"] if r["id"] in rows else 0,
                        "best_time_ms": rows[r["id"]]["best_time_ms"] if r["id"] in rows else None,
                    }
                    for r in roommates
                ]
                entries.sort(key=lambda e: -e["total_score"])

        return jsonify({"period": period, "entries": entries})
    finally:
        conn.close()
