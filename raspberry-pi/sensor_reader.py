#!/usr/bin/env python3
"""
Reads temperature/humidity from an RS485 Modbus RTU sensor (default register
map matches the common XY-MD02) and posts each reading to the dashboard's
/api/ingest endpoint. Readings that fail to send (e.g. Wi-Fi outage) are
queued in a local SQLite file and retried on the next cycle, so nothing is
lost while the Pi is offline.

Run continuously (see sensor-dashboard.service for a systemd unit that
restarts it automatically and starts it on boot).
"""

import logging
import os
import signal
import sqlite3
import sys
import time
from datetime import datetime, timezone

import minimalmodbus
import requests
import serial
from dotenv import load_dotenv

load_dotenv()

SERIAL_PORT = os.environ["SERIAL_PORT"]
BAUDRATE = int(os.environ.get("BAUDRATE", "9600"))
SLAVE_ADDRESS = int(os.environ.get("SLAVE_ADDRESS", "1"))
HUMIDITY_REGISTER = int(os.environ.get("HUMIDITY_REGISTER", "1"))
TEMPERATURE_REGISTER = int(os.environ.get("TEMPERATURE_REGISTER", "2"))

SEND_INTERVAL_SECONDS = float(os.environ.get("SEND_INTERVAL_SECONDS", "60"))

API_URL = os.environ["API_URL"]
API_KEY = os.environ["API_KEY"]
DEVICE_ID = os.environ.get("DEVICE_ID", "room-1")

BUFFER_DB_PATH = os.environ.get("BUFFER_DB_PATH", "./buffer.sqlite3")

REQUEST_TIMEOUT_SECONDS = 10
MAX_READ_RETRIES = 3
MAX_BUFFER_FLUSH_PER_CYCLE = 100

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
log = logging.getLogger("sensor_reader")

_shutdown_requested = False


def _handle_shutdown_signal(signum, _frame):
    global _shutdown_requested
    log.info("Received signal %s, shutting down after this cycle...", signum)
    _shutdown_requested = True


signal.signal(signal.SIGINT, _handle_shutdown_signal)
signal.signal(signal.SIGTERM, _handle_shutdown_signal)


def build_instrument() -> minimalmodbus.Instrument:
    instrument = minimalmodbus.Instrument(SERIAL_PORT, SLAVE_ADDRESS, mode=minimalmodbus.MODE_RTU)
    instrument.serial.baudrate = BAUDRATE
    instrument.serial.bytesize = 8
    instrument.serial.parity = serial.PARITY_NONE
    instrument.serial.stopbits = 1
    instrument.serial.timeout = 1
    instrument.clear_buffers_before_each_transaction = True
    return instrument


def read_sensor(instrument: minimalmodbus.Instrument) -> tuple[float, float]:
    """Returns (temperature_celsius, humidity_percent). Raises on failure."""
    last_error: Exception | None = None
    for attempt in range(1, MAX_READ_RETRIES + 1):
        try:
            humidity = instrument.read_register(
                HUMIDITY_REGISTER, number_of_decimals=1, functioncode=3, signed=False
            )
            temperature = instrument.read_register(
                TEMPERATURE_REGISTER, number_of_decimals=1, functioncode=3, signed=True
            )
            return temperature, humidity
        except (minimalmodbus.ModbusException, serial.SerialException, OSError) as exc:
            last_error = exc
            log.warning("Modbus read attempt %d/%d failed: %s", attempt, MAX_READ_RETRIES, exc)
            time.sleep(0.5)
    assert last_error is not None
    raise last_error


def init_buffer_db() -> sqlite3.Connection:
    conn = sqlite3.connect(BUFFER_DB_PATH)
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS pending_readings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            device_id TEXT NOT NULL,
            temperature REAL NOT NULL,
            humidity REAL NOT NULL,
            recorded_at TEXT NOT NULL
        )
        """
    )
    conn.commit()
    return conn


def buffer_add(conn: sqlite3.Connection, payload: dict) -> None:
    conn.execute(
        "INSERT INTO pending_readings (device_id, temperature, humidity, recorded_at) "
        "VALUES (?, ?, ?, ?)",
        (payload["device_id"], payload["temperature"], payload["humidity"], payload["recorded_at"]),
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
        "SELECT id, device_id, temperature, humidity, recorded_at FROM pending_readings "
        "ORDER BY id ASC LIMIT ?",
        (MAX_BUFFER_FLUSH_PER_CYCLE,),
    ).fetchall()
    if not rows:
        return

    log.info("Flushing %d buffered reading(s)...", len(rows))
    for row_id, device_id, temperature, humidity, recorded_at in rows:
        payload = {
            "device_id": device_id,
            "temperature": temperature,
            "humidity": humidity,
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
        "Starting sensor reader: port=%s slave=%s interval=%ss device_id=%s",
        SERIAL_PORT,
        SLAVE_ADDRESS,
        SEND_INTERVAL_SECONDS,
        DEVICE_ID,
    )

    instrument = build_instrument()
    buffer_conn = init_buffer_db()

    while not _shutdown_requested:
        cycle_start = time.monotonic()

        try:
            temperature, humidity = read_sensor(instrument)
            recorded_at = datetime.now(timezone.utc).isoformat()
            log.info("Reading: %.1f°C, %.1f%% RH", temperature, humidity)

            payload = {
                "device_id": DEVICE_ID,
                "temperature": temperature,
                "humidity": humidity,
                "recorded_at": recorded_at,
            }

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
        main()
    except KeyError as exc:
        log.error("Missing required environment variable: %s", exc)
        sys.exit(1)
