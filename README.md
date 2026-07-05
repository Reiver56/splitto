# Splitto - Shared bills for roommates

Splitto is a small web app for 2-3 roommates who share bills (electricity, gas, internet, rent...). It runs on your own computer, on your home network. Everyone can open it from their phone too, as long as they are on the same Wi-Fi.

No login, no password. Each person just picks their name once on their own phone/browser.

## What it can do

- Add a bill and split it manually between roommates (not just equal shares — you can type a custom amount per person).
- Mark each person's share as paid, one by one.
- See a dashboard with who owes what, and the smallest number of transfers needed to settle up.
- **Bill status**: each bill is "to pay", "due soon", "overdue", or "paid" automatically, based on its due date.
- **Recurring bills**: mark a bill as monthly/every 2 months/yearly, and Splitto creates the next one automatically.
- **History**: browse past paid bills, filter by category, roommate, year/month, sort by date/amount/category.
- **Predictions**: a simple estimate of the next bill amount per category, based on past bills (needs at least 3 bills in a category to give a number).
- **Statistics**: charts for spending by category, monthly trend, and who paid how much.
- **Push notifications**: a phone/browser alert when a new bill is added, and a daily reminder for bills due soon.
- **Daily mini-game**: a small puzzle, one try per day per roommate, with a leaderboard.
- Works well on both phone (single column, bottom tab bar) and a laptop/desktop browser (sidebar, wider layout).

## Tech stack

- Backend: Python + Flask + PostgreSQL
- Frontend: plain HTML/CSS/JavaScript (no framework, no build step)
- Charts: Chart.js (loaded from a CDN)
- Push notifications: Web Push + VAPID (`pywebpush`)
- Background jobs: APScheduler

## Before you start

You need:
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (for the database)
- Python 3.10 or newer

## 1. Start the database

From the project folder:

```bash
docker compose up -d
```

This starts a PostgreSQL database in a container. Default database name/user/password are all `splitto` (you can change them, see step 3).

To stop it later: `docker compose down` (your data stays saved). To also delete the data: `docker compose down -v`.

## 2. Install Python dependencies

Create a virtual environment (recommended):

```bash
python -m venv venv
```

Activate it:
- Windows PowerShell: `venv\Scripts\Activate.ps1`
- Windows cmd: `venv\Scripts\activate.bat`
- macOS/Linux: `source venv/bin/activate`

Install packages:

```bash
pip install -r requirements.txt
```

## 3. Set up your environment file

Copy the example file:

```bash
copy .env.example .env        # Windows
cp .env.example .env          # macOS/Linux
```

The default values already match `docker-compose.yml`, so you normally don't need to change anything for local use.

## 4. Create your push notification keys

```bash
python generate_vapid_keys.py
```

This creates a file called `vapid_private_key.pem` and prints two lines like:

```
VAPID_PRIVATE_KEY_FILE=vapid_private_key.pem
VAPID_PUBLIC_KEY=BN4Gv...long-string...
```

Copy these two lines into your `.env` file. Run this only once — if the `.pem` file already exists, the script won't overwrite it (so you don't lose keys already used by saved subscriptions).

## 5. Create the database tables

This happens automatically the first time you start the app (step 6). You can also run it by hand at any time — it's safe to run again, it won't erase your data:

```bash
python db.py
```

## 6. Start the app

```bash
python app.py
```

The app starts in HTTPS on `https://0.0.0.0:5000` by default (the port can be changed with `FLASK_PORT` in `.env`). It uses a self-signed certificate that Flask generates automatically.

Open on your computer: **`https://localhost:5000`**

Your browser will warn you that the connection is "not private" or "not secure". This is expected — it's a self-signed certificate made just for your own local server. Click "Advanced" then "Proceed" (wording differs by browser).

The first time, you'll see a setup screen to enter the names of your roommates (2 or 3 people). After that, each person just picks their name from a list — no password.

## 7. Find your computer's local IP address

You need this to open the app from your phone.

- **Windows**: open PowerShell and run `ipconfig`, look for "IPv4 Address" under your Wi-Fi adapter (e.g. `192.168.1.23`)
- **macOS**: `ipconfig getifaddr en0`
- **Linux**: `hostname -I`

## 8. Open it on your phone

> **Important**: don't type `127.0.0.1` or `localhost` on your phone. Those addresses always mean "this device" — on your phone, that's the phone itself, not your computer. Use the IP address from step 7 instead.

1. Make sure your phone is on the **same Wi-Fi network** as your computer. (Some "guest" Wi-Fi networks block devices from talking to each other — if it doesn't work, try turning that off, or use the main network.)
2. On your phone's browser, go to:

   ```
   https://<YOUR-COMPUTER-IP>:5000
   ```

   Example: `https://192.168.1.23:5000`

3. You'll see the same "not secure" warning as on your computer. This is normal for the same reason — accept it to continue.
4. Pick your name from the list. Your phone will ask for permission to send notifications — allow it if you want reminders.
5. Optional: use "Add to Home Screen" in your phone's browser menu, so Splitto shows up like a regular app icon.

## How push notifications work

1. The first time a person picks their name, the browser asks for notification permission. If allowed, that device is registered to receive push messages.
2. When someone adds a new bill, everyone else involved in that bill gets a push notification with the amount they owe.
3. Every day at 9:00 (you can change this with `REMINDER_HOUR` / `REMINDER_MINUTE` in `.env`), the app checks for bills due within 3 days that still have unpaid shares, and sends one reminder per bill (never more than once).
4. Notifications keep working even if the browser tab is closed, as long as the browser itself is still installed on the device.

If a device's notification subscription becomes invalid (for example, the browser was uninstalled), it's automatically removed from the database next time a push fails to send.

## Project structure

```
app.py                Main Flask app: core routes, registers the blueprints below
bills.py               Bills, splits, balances, recurring-bill logic (Flask blueprint)
predictions.py         Category spending predictions (Flask blueprint)
statistics_api.py      Spending statistics with period filters (Flask blueprint)
game.py                Daily mini-game scores and leaderboard (Flask blueprint)
config.py              Settings loaded from environment variables
db.py                  Database connection + schema/migrations setup
migrations.py           Runs SQL files in migrations/ that haven't run yet
migrations/            Incremental database changes (numbered .sql files)
push.py                Sends Web Push notifications
scheduler.py            Daily background jobs (reminders, recurring bill spawn)
generate_vapid_keys.py Generates the push notification key pair
schema.sql              Base database tables (used on a brand new install)
docker-compose.yml      PostgreSQL service, ready to use
requirements.txt        Python dependencies
templates/index.html    The single HTML page (all sections live here)
static/css/style.css    Shared styles, mobile layout, dark/light theme
static/css/desktop.css  Layout overrides for wide screens only (sidebar, tables)
static/css/game.css     Styles for the daily puzzle grid
static/js/app.js        Shared helpers, navigation, dashboard, add-bill form
static/js/history.js    History section (filters, table/cards)
static/js/statistics.js Statistics + predictions charts
static/js/game.js       Daily puzzle logic and leaderboard
static/js/sw.js         Service worker (receives push, handles notification clicks)
```

## Extending the project

- **Add a database change**: create a new file in `migrations/`, named with the next number (e.g. `003_something.sql`). Use `ADD COLUMN IF NOT EXISTS` / `CREATE TABLE IF NOT EXISTS` so it's safe to re-run. It will be applied automatically next time the app starts, and only once (tracked in the `schema_migrations` table).
- **Add a new API area**: create a new Python file with a Flask `Blueprint` (see `predictions.py` for the simplest example), then register it in `app.py`.
- **Add a new frontend section**: add a `<section id="section-yourname" class="app-section hidden">` in `templates/index.html`, add a nav button with `data-section="yourname"` in both the sidebar and the bottom tab bar, and listen for `Splitto.onSectionShown("yourname", ...)` in a new `static/js/yourname.js` file (see `history.js` for a simple example). Shared helpers (`fetchJSON`, `formatMoney`, current user, etc.) are available on the global `Splitto` object, set up in `app.js`.

## Troubleshooting

- **`psycopg2.OperationalError: connection refused`**: the database isn't running. Run `docker compose up -d` and check that `.env` matches `docker-compose.yml`.
- **Notifications don't arrive**: make sure you generated the VAPID keys (step 4) and that `VAPID_PUBLIC_KEY` is filled in `.env`. Also check the browser's notification permission for the site.
- **Nothing loads on the phone / times out**: check that both devices are on the same Wi-Fi, that Windows Firewall isn't blocking the port, and that the router isn't isolating devices from each other ("guest" networks often do this).
- **`127.0.0.1` or `localhost` doesn't work on the phone**: expected, see step 8 — use your computer's IP address instead.
- **`PermissionError` when starting with `FLASK_PORT=443`**: on Windows, ports below 1024 need administrator rights. Either run your terminal as Administrator, or set `FLASK_PORT=5000` in `.env`.
