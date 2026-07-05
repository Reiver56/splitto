import datetime
from decimal import Decimal

from flask import Flask, jsonify, render_template, request, send_from_directory
from flask.json.provider import DefaultJSONProvider

from bills import bills_bp
from config import Config
from db import get_connection, get_cursor, init_schema
from game import game_bp
from predictions import predictions_bp
from push import save_subscription
from scheduler import start_scheduler
from statistics_api import statistics_bp

DEFAULT_CATEGORIES = ["luce", "gas", "internet", "affitto", "altro"]


class CustomJSONProvider(DefaultJSONProvider):
    def default(self, o):
        if isinstance(o, Decimal):
            return float(o)
        if isinstance(o, (datetime.date, datetime.datetime)):
            return o.isoformat()
        return super().default(o)


app = Flask(__name__)
app.json = CustomJSONProvider(app)

app.register_blueprint(bills_bp)
app.register_blueprint(predictions_bp)
app.register_blueprint(statistics_bp)
app.register_blueprint(game_bp)


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/sw.js")
def service_worker():
    # Servito dalla root (non da /static/) cosi' il service worker ottiene
    # uno scope pari a tutto il sito, requisito per ricevere le push ovunque.
    response = send_from_directory("static/js", "sw.js")
    response.headers["Service-Worker-Allowed"] = "/"
    return response


@app.route("/manifest.json")
def manifest():
    return send_from_directory("static", "manifest.json")


@app.route("/api/vapid-public-key")
def vapid_public_key():
    return jsonify({"publicKey": Config.VAPID_PUBLIC_KEY})


@app.route("/api/roommates", methods=["GET"])
def get_roommates():
    conn = get_connection()
    try:
        with get_cursor(conn) as cur:
            cur.execute("SELECT id, name FROM roommates ORDER BY id")
            roommates = cur.fetchall()
        return jsonify(roommates)
    finally:
        conn.close()


@app.route("/api/roommates/setup", methods=["POST"])
def setup_roommates():
    data = request.get_json(force=True) or {}
    names = [n.strip() for n in data.get("names", []) if n and n.strip()]

    if not (2 <= len(names) <= 3):
        return jsonify({"error": "Servono 2 o 3 nomi di coinquilini."}), 400

    conn = get_connection()
    try:
        with get_cursor(conn) as cur:
            cur.execute("SELECT COUNT(*) AS count FROM roommates")
            if cur.fetchone()["count"] > 0:
                return jsonify({"error": "I coinquilini sono gia' stati configurati."}), 409

            created = []
            for name in names:
                cur.execute(
                    "INSERT INTO roommates (name) VALUES (%s) RETURNING id, name",
                    (name,),
                )
                created.append(cur.fetchone())
        conn.commit()
        return jsonify(created), 201
    finally:
        conn.close()


@app.route("/api/categories")
def get_categories():
    conn = get_connection()
    try:
        with get_cursor(conn) as cur:
            cur.execute("SELECT DISTINCT category FROM bills ORDER BY category")
            used = [row["category"] for row in cur.fetchall()]
        categories = list(dict.fromkeys(DEFAULT_CATEGORIES + used))
        return jsonify(categories)
    finally:
        conn.close()


@app.route("/api/subscribe", methods=["POST"])
def subscribe():
    data = request.get_json(force=True) or {}
    roommate_id = data.get("roommate_id")
    subscription_info = data.get("subscription")

    if not roommate_id or not subscription_info:
        return jsonify({"error": "Dati di subscription mancanti."}), 400

    save_subscription(roommate_id, subscription_info)
    return jsonify({"status": "ok"}), 201


if __name__ == "__main__":
    init_schema()
    start_scheduler()
    try:
        app.run(host="0.0.0.0", port=Config.FLASK_PORT, ssl_context="adhoc", debug=False)
    except PermissionError:
        print(
            f"\nPermesso negato per aprire la porta {Config.FLASK_PORT}.\n"
            "Le porte sotto la 1024 (es. 443) richiedono privilegi di amministratore su Windows:\n"
            "riavvia il terminale come Amministratore e rilancia 'python app.py',\n"
            "oppure imposta FLASK_PORT=5000 nel file .env per usare una porta senza restrizioni.\n"
        )
        raise
