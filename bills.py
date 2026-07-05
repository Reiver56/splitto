import datetime
from decimal import Decimal

from flask import Blueprint, jsonify, request

from db import get_connection, get_cursor
from push import send_push_to_roommate

bills_bp = Blueprint("bills", __name__)

DUE_SOON_DAYS = 7
RECURRENCE_INTERVALS = {
    "monthly": "1 month",
    "bimonthly": "2 months",
    "yearly": "1 year",
}


def _lifecycle_status(bill):
    if bill["paid_by"] is None:
        return "non_pagata"
    if bill["splits"] and all(s["paid"] for s in bill["splits"]):
        return "saldata"
    due_date = bill["due_date"]
    if due_date is None:
        return "da_pagare"
    today = datetime.date.today()
    if due_date < today:
        return "scaduta"
    if due_date <= today + datetime.timedelta(days=DUE_SOON_DAYS):
        return "in_scadenza"
    return "da_pagare"


def _fetch_splits(cur, bill_id):
    cur.execute(
        """
        SELECT bs.id, bs.roommate_id, r.name AS roommate_name,
               bs.amount_due, bs.paid, bs.paid_at
        FROM bill_splits bs
        JOIN roommates r ON r.id = bs.roommate_id
        WHERE bs.bill_id = %s
        ORDER BY r.name
        """,
        (bill_id,),
    )
    return cur.fetchall()


def _insert_bill_and_splits(
    cur,
    description,
    amount_total,
    category,
    due_date,
    paid_by,
    notes,
    is_recurring,
    recurrence_frequency,
    splits,
    recurrence_parent_id=None,
    force_all_paid=False,
):
    cur.execute(
        """
        INSERT INTO bills (description, amount_total, category, due_date, paid_by, notes,
                            is_recurring, recurrence_frequency, recurrence_parent_id)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        RETURNING id
        """,
        (
            description,
            amount_total,
            category,
            due_date,
            paid_by,
            notes,
            is_recurring,
            recurrence_frequency,
            recurrence_parent_id,
        ),
    )
    bill_id = cur.fetchone()["id"]
    _insert_splits(cur, bill_id, paid_by, splits, force_all_paid=force_all_paid)
    return bill_id


def _insert_splits(cur, bill_id, paid_by, splits, force_all_paid=False):
    for roommate_id, amount in splits:
        is_paid = force_all_paid or roommate_id == paid_by
        cur.execute(
            """
            INSERT INTO bill_splits (bill_id, roommate_id, amount_due, paid, paid_at)
            VALUES (%s, %s, %s, %s, %s)
            """,
            (bill_id, roommate_id, amount, is_paid, datetime.datetime.now() if is_paid else None),
        )


def spawn_next_occurrence(cur, bill_id):
    """Genera la prossima occorrenza di una bolletta ricorrente, se non gia' generata.

    Condiviso tra il toggle di una quota (quando la bolletta risulta tutta saldata)
    e il job schedulato che copre il caso "scadenza raggiunta senza mai saldare".
    """
    cur.execute(
        """
        SELECT id, description, amount_total, category, due_date, paid_by, notes,
               recurrence_frequency, recurrence_spawned
        FROM bills WHERE id = %s
        """,
        (bill_id,),
    )
    bill = cur.fetchone()
    if not bill or bill["recurrence_spawned"] or not bill["recurrence_frequency"]:
        return None

    interval = RECURRENCE_INTERVALS.get(bill["recurrence_frequency"])
    if not interval:
        return None

    base_date = bill["due_date"] or datetime.date.today()
    cur.execute("SELECT (%s::date + %s::interval)::date AS next_date", (base_date, interval))
    next_due_date = cur.fetchone()["next_date"]

    cur.execute("SELECT roommate_id, amount_due FROM bill_splits WHERE bill_id = %s", (bill_id,))
    splits = [(row["roommate_id"], row["amount_due"]) for row in cur.fetchall()]

    new_bill_id = _insert_bill_and_splits(
        cur,
        bill["description"],
        bill["amount_total"],
        bill["category"],
        next_due_date,
        bill["paid_by"],
        bill["notes"],
        True,
        bill["recurrence_frequency"],
        splits,
        recurrence_parent_id=bill_id,
    )
    cur.execute("UPDATE bills SET recurrence_spawned = TRUE WHERE id = %s", (bill_id,))
    return new_bill_id


@bills_bp.route("/api/bills", methods=["GET"])
def get_bills():
    category = request.args.get("category")
    roommate_id = request.args.get("roommate_id", type=int)
    date_from = request.args.get("date_from")
    date_to = request.args.get("date_to")
    year = request.args.get("year", type=int)
    month = request.args.get("month", type=int)
    only_history = request.args.get("only_history") == "true"
    sort = request.args.get("sort", "date")
    order = request.args.get("order", "asc")

    where = []
    params = []

    if category:
        where.append("b.category = %s")
        params.append(category)
    if roommate_id:
        where.append(
            "EXISTS (SELECT 1 FROM bill_splits bs WHERE bs.bill_id = b.id AND bs.roommate_id = %s)"
        )
        params.append(roommate_id)
    if date_from:
        where.append("b.due_date >= %s")
        params.append(date_from)
    if date_to:
        where.append("b.due_date <= %s")
        params.append(date_to)
    if year:
        where.append("EXTRACT(YEAR FROM COALESCE(b.due_date, b.created_at::date)) = %s")
        params.append(year)
    if month:
        where.append("EXTRACT(MONTH FROM COALESCE(b.due_date, b.created_at::date)) = %s")
        params.append(month)
    if only_history:
        where.append(
            "NOT EXISTS (SELECT 1 FROM bill_splits bs2 WHERE bs2.bill_id = b.id AND bs2.paid = FALSE)"
        )

    order_dir = "ASC" if order == "asc" else "DESC"
    if sort == "amount":
        order_clause = f"b.amount_total {order_dir}"
    elif sort == "category":
        order_clause = f"b.category {order_dir}"
    else:
        order_clause = f"b.due_date {order_dir} NULLS LAST, b.created_at DESC"

    where_clause = f"WHERE {' AND '.join(where)}" if where else ""
    query = f"""
        SELECT b.id, b.description, b.amount_total, b.category, b.due_date,
               b.paid_by, r.name AS paid_by_name, b.notes, b.reminder_sent, b.created_at,
               b.is_recurring, b.recurrence_frequency
        FROM bills b
        LEFT JOIN roommates r ON r.id = b.paid_by
        {where_clause}
        ORDER BY {order_clause}
    """

    conn = get_connection()
    try:
        with get_cursor(conn) as cur:
            cur.execute(query, params)
            bills = cur.fetchall()

            for bill in bills:
                bill["splits"] = _fetch_splits(cur, bill["id"])
                bill["lifecycle_status"] = _lifecycle_status(bill)

        return jsonify(bills)
    finally:
        conn.close()


@bills_bp.route("/api/bills", methods=["POST"])
def create_bill():
    data = request.get_json(force=True) or {}

    description = (data.get("description") or "").strip()
    category = (data.get("category") or "altro").strip() or "altro"
    due_date = data.get("due_date") or None
    notes = (data.get("notes") or "").strip() or None
    paid_by = data.get("paid_by") or None
    splits = data.get("splits") or []
    is_historical = bool(data.get("is_historical"))
    is_recurring = bool(data.get("is_recurring")) and not is_historical and paid_by is not None
    recurrence_frequency = data.get("recurrence_frequency") if is_recurring else None

    try:
        inserted_by = int(data.get("inserted_by")) if data.get("inserted_by") is not None else None
    except (TypeError, ValueError):
        inserted_by = None

    try:
        amount_total = Decimal(str(data.get("amount_total")))
    except Exception:
        return jsonify({"error": "Importo totale non valido."}), 400

    if not description:
        return jsonify({"error": "La descrizione e' obbligatoria."}), 400
    if amount_total <= 0:
        return jsonify({"error": "L'importo totale deve essere maggiore di zero."}), 400
    if is_historical and not paid_by:
        return jsonify({"error": "Una bolletta storica deve indicare chi l'ha pagata."}), 400
    if paid_by and not splits:
        return jsonify({"error": "Selezionare almeno un partecipante alla spesa."}), 400
    if is_recurring and recurrence_frequency not in RECURRENCE_INTERVALS:
        return jsonify({"error": "Frequenza di ricorrenza non valida."}), 400

    if paid_by:
        try:
            paid_by = int(paid_by)
        except (TypeError, ValueError):
            return jsonify({"error": "Chi ha pagato non e' valido."}), 400

    parsed_splits = []
    for split in splits:
        try:
            roommate_id = int(split["roommate_id"])
            amount = Decimal(str(split["amount"]))
        except Exception:
            return jsonify({"error": "Quota non valida."}), 400
        if amount < 0:
            return jsonify({"error": "Le quote non possono essere negative."}), 400
        parsed_splits.append((roommate_id, amount))

    conn = get_connection()
    try:
        with get_cursor(conn) as cur:
            bill_id = _insert_bill_and_splits(
                cur,
                description,
                amount_total,
                category,
                due_date,
                paid_by,
                notes,
                is_recurring,
                recurrence_frequency,
                parsed_splits,
                force_all_paid=is_historical,
            )
        conn.commit()
    finally:
        conn.close()

    if paid_by and not is_historical:
        for roommate_id, amount in parsed_splits:
            if roommate_id == inserted_by or roommate_id == paid_by:
                continue
            send_push_to_roommate(
                roommate_id,
                {
                    "title": "Nuova bolletta",
                    "body": f"{description}: devi {amount} EUR",
                    "tag": f"bill-{bill_id}",
                },
            )

    return jsonify({"id": bill_id}), 201


@bills_bp.route("/api/bills/<int:bill_id>/claim", methods=["POST"])
def claim_bill(bill_id):
    """Un coinquilino si assegna il pagamento di una bolletta finora senza
    pagante, scegliendo in quel momento partecipanti e quote."""
    data = request.get_json(force=True) or {}

    paid_by = data.get("paid_by")
    splits = data.get("splits") or []

    try:
        inserted_by = int(data.get("inserted_by")) if data.get("inserted_by") is not None else None
    except (TypeError, ValueError):
        inserted_by = None

    if not paid_by:
        return jsonify({"error": "Specificare chi ha pagato la bolletta."}), 400
    if not splits:
        return jsonify({"error": "Selezionare almeno un partecipante alla spesa."}), 400

    try:
        paid_by = int(paid_by)
    except (TypeError, ValueError):
        return jsonify({"error": "Chi ha pagato non e' valido."}), 400

    parsed_splits = []
    for split in splits:
        try:
            roommate_id = int(split["roommate_id"])
            amount = Decimal(str(split["amount"]))
        except Exception:
            return jsonify({"error": "Quota non valida."}), 400
        if amount < 0:
            return jsonify({"error": "Le quote non possono essere negative."}), 400
        parsed_splits.append((roommate_id, amount))

    conn = get_connection()
    try:
        with get_cursor(conn) as cur:
            cur.execute("SELECT id, description FROM bills WHERE id = %s AND paid_by IS NULL", (bill_id,))
            bill = cur.fetchone()
            if not bill:
                return jsonify({"error": "Bolletta non trovata o gia' assegnata a un pagante."}), 409

            cur.execute("UPDATE bills SET paid_by = %s WHERE id = %s", (paid_by, bill_id))
            _insert_splits(cur, bill_id, paid_by, parsed_splits)
        conn.commit()
    finally:
        conn.close()

    for roommate_id, amount in parsed_splits:
        if roommate_id == inserted_by or roommate_id == paid_by:
            continue
        send_push_to_roommate(
            roommate_id,
            {
                "title": "Bolletta anticipata da un coinquilino",
                "body": f"{bill['description']}: devi {amount} EUR",
                "tag": f"bill-{bill_id}",
            },
        )

    return jsonify({"id": bill_id}), 200


@bills_bp.route("/api/splits/<int:split_id>/toggle", methods=["POST"])
def toggle_split(split_id):
    conn = get_connection()
    try:
        with get_cursor(conn) as cur:
            cur.execute("SELECT id, bill_id, paid FROM bill_splits WHERE id = %s", (split_id,))
            split = cur.fetchone()
            if not split:
                return jsonify({"error": "Quota non trovata."}), 404

            new_paid = not split["paid"]
            cur.execute(
                """
                UPDATE bill_splits
                SET paid = %s, paid_at = %s
                WHERE id = %s
                RETURNING id, bill_id, roommate_id, amount_due, paid, paid_at
                """,
                (new_paid, datetime.datetime.now() if new_paid else None, split_id),
            )
            updated = cur.fetchone()

            if new_paid:
                cur.execute(
                    "SELECT COUNT(*) AS unpaid FROM bill_splits WHERE bill_id = %s AND paid = FALSE",
                    (split["bill_id"],),
                )
                if cur.fetchone()["unpaid"] == 0:
                    spawn_next_occurrence(cur, split["bill_id"])

        conn.commit()
        return jsonify(updated)
    finally:
        conn.close()


@bills_bp.route("/api/balances")
def get_balances():
    conn = get_connection()
    try:
        with get_cursor(conn) as cur:
            cur.execute("SELECT id, name FROM roommates ORDER BY id")
            roommates = cur.fetchall()

            balances = {r["id"]: Decimal("0") for r in roommates}

            cur.execute(
                """
                SELECT bs.roommate_id AS ower_id, b.paid_by AS payer_id, bs.amount_due
                FROM bill_splits bs
                JOIN bills b ON b.id = bs.bill_id
                WHERE bs.paid = FALSE AND bs.roommate_id != b.paid_by
                """
            )
            for row in cur.fetchall():
                balances[row["payer_id"]] += row["amount_due"]
                balances[row["ower_id"]] -= row["amount_due"]

        names_by_id = {r["id"]: r["name"] for r in roommates}

        result_balances = [
            {"roommate_id": rid, "name": names_by_id[rid], "balance": float(bal)}
            for rid, bal in balances.items()
        ]

        transfers = _compute_settlements(balances, names_by_id)

        return jsonify({"balances": result_balances, "settlements": transfers})
    finally:
        conn.close()


def _compute_settlements(balances, names_by_id):
    threshold = Decimal("0.005")
    creditors = [[rid, bal] for rid, bal in balances.items() if bal > threshold]
    debtors = [[rid, -bal] for rid, bal in balances.items() if bal < -threshold]
    creditors.sort(key=lambda x: -x[1])
    debtors.sort(key=lambda x: -x[1])

    transfers = []
    i, j = 0, 0
    while i < len(debtors) and j < len(creditors):
        debtor_id, debt_amount = debtors[i]
        creditor_id, credit_amount = creditors[j]
        amount = min(debt_amount, credit_amount)

        transfers.append(
            {
                "from_id": debtor_id,
                "from_name": names_by_id[debtor_id],
                "to_id": creditor_id,
                "to_name": names_by_id[creditor_id],
                "amount": round(float(amount), 2),
            }
        )

        debtors[i][1] -= amount
        creditors[j][1] -= amount
        if debtors[i][1] <= threshold:
            i += 1
        if creditors[j][1] <= threshold:
            j += 1

    return transfers
