#!/usr/bin/env python3
"""
Generic sensor runtime for the Raspberry Pi side of the project.

Reads whichever sensor a `profiles/<SENSOR_TYPE>.py` module knows how to
read (temperature/humidity, a current meter, etc. - see profiles/ for the
list) and posts each reading to the dashboard's /api/ingest endpoint.
Readings that fail to send (e.g. Wi-Fi outage) are queued in a local SQLite
file and retried on the next cycle, so nothing is lost while the Pi is
offline.

Adding a new sensor type: write a new module in profiles/ that exposes
SENSOR_TYPE, build_instrument(), and read(instrument) -> dict[str, float],
then set SENSOR_TYPE in .env to that module's name. Nothing in this file
needs to change.

Run continuously (see sensor-dashboard.service for a systemd unit that
restarts it automatically and starts it on boot).
"""

import importlib
import json
import logging
import os
import signal
import sqlite3
import sys
import time
from datetime import datetime, timezone

import requests
from dotenv import load_dotenv

load_dotenv()

REQUEST_TIMEOUT_SECONDS = 10
MAX_BUFFER_FLUSH_PER_CYCLE = 100

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
log = logging.getLogger("sensor_reader")

# Populated by _load_config(), called from the __main__ guard below so that
# a missing/invalid environment variable raises *inside* that guard's
# try/except instead of crashing during module import (a bare read like
# `os.environ["SENSOR_TYPE"]` at module level runs before the __main__
# guard is ever reached, so a try/except wrapped only around main() could
# never actually catch it).
SENSOR_TYPE: str
SEND_INTERVAL_SECONDS: float
API_URL: str
API_KEY: str
DEVICE_ID: str
DEVICE_LABEL: str
BUFFER_DB_PATH: str
profile = None


def _load_config() -> None:
    global SENSOR_TYPE, SEND_INTERVAL_SECONDS, API_URL, API_KEY
    global DEVICE_ID, DEVICE_LABEL, BUFFER_DB_PATH, profile

    SENSOR_TYPE = os.environ["SENSOR_TYPE"]
    SEND_INTERVAL_SECONDS = float(os.environ.get("SEND_INTERVAL_SECONDS", "60"))
    API_URL = os.environ["API_URL"]
    API_KEY = os.environ["API_KEY"]
    DEVICE_ID = os.environ.get("DEVICE_ID", "room-1")
    DEVICE_LABEL = os.environ.get("DEVICE_LABEL", "")
    BUFFER_DB_PATH = os.environ.get("BUFFER_DB_PATH", "./buffer.sqlite3")

    try:
        profile = importlib.import_module(f"profiles.{SENSOR_TYPE}")
    except ModuleNotFoundError as exc:
        raise RuntimeError(
            f"No profiles/{SENSOR_TYPE}.py found for SENSOR_TYPE={SENSOR_TYPE}"
        ) from exc


_shutdown_requested = False


def _handle_shutdown_signal(signum, _frame):
    global _shutdown_requested
    log.info("Received signal %s, shutting down after this cycle...", signum)
    _shutdown_requested = True


signal.signal(signal.SIGINT, _handle_shutdown_signal)
signal.signal(signal.SIGTERM, _handle_shutdown_signal)


def init_buffer_db() -> sqlite3.Connection:
    conn = sqlite3.connect(BUFFER_DB_PATH)
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS pending_readings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            device_id TEXT NOT NULL,
            sensor_type TEXT NOT NULL,
            metrics_json TEXT NOT NULL,
            recorded_at TEXT NOT NULL
        )
        """
    )
    conn.commit()
    return conn


def buffer_add(conn: sqlite3.Connection, payload: dict) -> None:
    conn.execute(
        "INSERT INTO pending_readings (device_id, sensor_type, metrics_json, recorded_at) "
        "VALUES (?, ?, ?, ?)",
        (
            payload["device_id"],
            payload["sensor_type"],
            json.dumps(payload["metrics"]),
            payload["recorded_at"],
        ),
    )
    conn.commit()


def send_payload(payload: dict) -> bool:
    try:
        response = requests.post(
            API_URL,
            json=payload,
            headers={"x-api-key": API_KEY, "Content-Type": "application/json"},
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
        if response.status_code in (200, 201):
            return True
        log.warning("Server rejected reading: HTTP %s %s", response.status_code, response.text[:200])
        return False
    except requests.RequestException as exc:
        log.warning("Network error sending reading: %s", exc)
        return False


def flush_buffer(conn: sqlite3.Connection) -> None:
    rows = conn.execute(
        "SELECT id, device_id, sensor_type, metrics_json, recorded_at FROM pending_readings "
        "ORDER BY id ASC LIMIT ?",
        (MAX_BUFFER_FLUSH_PER_CYCLE,),
    ).fetchall()
    if not rows:
        return

    log.info("Flushing %d buffered reading(s)...", len(rows))
    for row_id, device_id, sensor_type, metrics_json, recorded_at in rows:
        payload = {
            "device_id": device_id,
            "sensor_type": sensor_type,
            "metrics": json.loads(metrics_json),
            "recorded_at": recorded_at,
        }
        if send_payload(payload):
            conn.execute("DELETE FROM pending_readings WHERE id = ?", (row_id,))
            conn.commit()
        else:
            # Stop at the first failure - keep remaining rows in order for next cycle.
            log.warning("Stopping buffer flush early; server/network still unavailable")
            break


def main() -> None:
    log.info(
        "Starting sensor reader: sensor_type=%s interval=%ss device_id=%s",
        SENSOR_TYPE,
        SEND_INTERVAL_SECONDS,
        DEVICE_ID,
    )

    instrument = profile.build_instrument()
    buffer_conn = init_buffer_db()

    while not _shutdown_requested:
        cycle_start = time.monotonic()

        try:
            metrics = profile.read(instrument)
            recorded_at = datetime.now(timezone.utc).isoformat()
            log.info("Reading: %s", metrics)

            payload = {
                "device_id": DEVICE_ID,
                "sensor_type": SENSOR_TYPE,
                "metrics": metrics,
                "recorded_at": recorded_at,
            }
            if DEVICE_LABEL:
                payload["label"] = DEVICE_LABEL

            flush_buffer(buffer_conn)

            if not send_payload(payload):
                log.warning("Send failed, buffering reading for retry")
                buffer_add(buffer_conn, payload)

        except Exception:
            log.exception("Unexpected error during read/send cycle")

        elapsed = time.monotonic() - cycle_start
        time.sleep(max(0.0, SEND_INTERVAL_SECONDS - elapsed))

    buffer_conn.close()
    log.info("Stopped cleanly")


if __name__ == "__main__":
    try:
        _load_config()
        main()
    except KeyError as exc:
        log.error("Missing required environment variable: %s", exc)
        sys.exit(1)
    except RuntimeError as exc:
        log.error(str(exc))
        sys.exit(1)
