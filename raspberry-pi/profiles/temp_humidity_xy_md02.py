"""
Sensor profile for the XY-MD02 temperature/humidity Modbus RTU sensor.

Every sensor profile module exposes the same interface so sensor_reader.py
can use any of them interchangeably:
  - SENSOR_TYPE: str, must match an entry in the web app's
    src/lib/sensorTypes.ts SENSOR_TYPE_METRICS registry.
  - build_instrument(): opens the Modbus connection.
  - read(instrument): returns {metric_key: value, ...} for one reading cycle.

To support a different temperature/humidity sensor (or any other Modbus RTU
sensor), copy this file, change SENSOR_TYPE and the register addresses/scaling
to match that sensor's datasheet, and point SENSOR_TYPE in .env at the new
module name.
"""

import logging
import os
import time

import minimalmodbus
import serial

SENSOR_TYPE = "temp_humidity_xy_md02"

SERIAL_PORT = os.environ["SERIAL_PORT"]
BAUDRATE = int(os.environ.get("BAUDRATE", "9600"))
SLAVE_ADDRESS = int(os.environ.get("SLAVE_ADDRESS", "1"))
# Register addresses + Modbus function code. Defaults verified against real
# XY-MD02 hardware (function code 04 = read input registers). Some
# clones/units expose these as holding registers (function code 03) instead -
# if reads keep failing, scan your sensor (see scan_xy.py) or check its
# datasheet and override READ_FUNCTION_CODE via .env.
HUMIDITY_REGISTER = int(os.environ.get("HUMIDITY_REGISTER", "1"))
TEMPERATURE_REGISTER = int(os.environ.get("TEMPERATURE_REGISTER", "2"))
READ_FUNCTION_CODE = int(os.environ.get("READ_FUNCTION_CODE", "4"))

MAX_READ_RETRIES = 3

log = logging.getLogger("sensor_reader.profiles.temp_humidity_xy_md02")


def build_instrument() -> minimalmodbus.Instrument:
    instrument = minimalmodbus.Instrument(SERIAL_PORT, SLAVE_ADDRESS, mode=minimalmodbus.MODE_RTU)
    instrument.serial.baudrate = BAUDRATE
    instrument.serial.bytesize = 8
    instrument.serial.parity = serial.PARITY_NONE
    instrument.serial.stopbits = 1
    instrument.serial.timeout = 1
    instrument.clear_buffers_before_each_transaction = True
    return instrument


def read(instrument: minimalmodbus.Instrument) -> dict[str, float]:
    """Returns {"temperature": ..., "humidity": ...}. Raises on failure."""
    last_error: Exception | None = None
    for attempt in range(1, MAX_READ_RETRIES + 1):
        try:
            humidity = instrument.read_register(
                HUMIDITY_REGISTER, number_of_decimals=1, functioncode=READ_FUNCTION_CODE, signed=False
            )
            temperature = instrument.read_register(
                TEMPERATURE_REGISTER, number_of_decimals=1, functioncode=READ_FUNCTION_CODE, signed=True
            )
            return {"temperature": temperature, "humidity": humidity}
        except (minimalmodbus.ModbusException, serial.SerialException, OSError) as exc:
            last_error = exc
            log.warning("Modbus read attempt %d/%d failed: %s", attempt, MAX_READ_RETRIES, exc)
            time.sleep(0.5)
    assert last_error is not None
    raise last_error
