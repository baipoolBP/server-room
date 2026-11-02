"""
Sensor profile combining two Modbus RTU devices on the SAME RS485 bus:
  - XY-MD02 (temperature/humidity)
  - PZEM-016 (AC voltage/current/power/energy/frequency/power factor)

Every sensor profile module exposes the same interface so sensor_reader.py
can use any of them interchangeably:
  - SENSOR_TYPE: str, must match an entry in the web app's
    src/lib/sensorTypes.ts SENSOR_TYPE_METRICS registry.
  - build_instrument(): opens the Modbus connection.
  - read(instrument): returns {metric_key: value, ...} for one reading cycle.

Why one profile instead of two separate sensor_reader.py processes: both
devices share one physical RS485 bus. Two independent OS processes each
opening the same serial port would race on the half-duplex line (one could
start transmitting mid-transaction of the other), causing intermittent CRC
errors on both. Reading them sequentially from one process avoids that.

Multi-slave technique: minimalmodbus lets you reuse a single Instrument
object for multiple slave addresses on one bus by changing `.address`
before each transaction, instead of opening the serial port twice.

IMPORTANT - slave address collision: both XY-MD02 and PZEM-016 ship from
the factory at Modbus address 1. If both are still at their defaults, they
WILL collide on this shared bus. Before wiring them together, reassign one
of them (see set_pzem_address.py) to a unique address and set
PZEM_SLAVE_ADDRESS/XY_SLAVE_ADDRESS below to match.

A read failure on one device does not block the other - this profile
reports whatever succeeded and only raises if BOTH devices fail, so a
temporarily disconnected PZEM (for example) doesn't stop temperature/
humidity readings from being sent.
"""

import logging
import os
import time

import minimalmodbus
import serial

SENSOR_TYPE = "room_climate_power"

SERIAL_PORT = os.environ["SERIAL_PORT"]
BAUDRATE = int(os.environ.get("BAUDRATE", "9600"))
MAX_READ_RETRIES = 3
RETRY_DELAY_SECONDS = 0.3

log = logging.getLogger("sensor_reader.profiles.room_climate_power")

# --- XY-MD02 (temperature/humidity) ---
# Defaults verified against real XY-MD02 hardware (function code 04 = read
# input registers). Some clones/units expose these as holding registers
# (function code 03) instead - see scan_xy.py if reads keep failing.
XY_SLAVE_ADDRESS = int(os.environ.get("XY_SLAVE_ADDRESS", "1"))
HUMIDITY_REGISTER = int(os.environ.get("HUMIDITY_REGISTER", "1"))
TEMPERATURE_REGISTER = int(os.environ.get("TEMPERATURE_REGISTER", "2"))
XY_READ_FUNCTION_CODE = int(os.environ.get("XY_READ_FUNCTION_CODE", "4"))

# --- PZEM-016 (AC power meter) ---
# Register map is fixed by the PZEM-016 datasheet (function code 04 = read
# input registers). Current/power/energy are 32-bit values split across two
# consecutive 16-bit registers (low word at the lower address).
PZEM_SLAVE_ADDRESS = int(os.environ.get("PZEM_SLAVE_ADDRESS", "2"))
PZEM_READ_FUNCTION_CODE = int(os.environ.get("PZEM_READ_FUNCTION_CODE", "4"))
PZEM_VOLTAGE_REGISTER = 0x0000  # 0.1 V per unit
PZEM_CURRENT_REGISTER = 0x0001  # 32-bit, 0.001 A per unit
PZEM_POWER_REGISTER = 0x0003  # 32-bit, 0.1 W per unit
PZEM_ENERGY_REGISTER = 0x0005  # 32-bit, 1 Wh per unit
PZEM_FREQUENCY_REGISTER = 0x0007  # 0.1 Hz per unit
PZEM_POWER_FACTOR_REGISTER = 0x0008  # 0.01 per unit


def build_instrument() -> minimalmodbus.Instrument:
    instrument = minimalmodbus.Instrument(SERIAL_PORT, XY_SLAVE_ADDRESS, mode=minimalmodbus.MODE_RTU)
    instrument.serial.baudrate = BAUDRATE
    instrument.serial.bytesize = 8
    instrument.serial.parity = serial.PARITY_NONE
    instrument.serial.stopbits = 1
    instrument.serial.timeout = 1
    instrument.clear_buffers_before_each_transaction = True
    return instrument


def _read_u32(instrument: minimalmodbus.Instrument, address: int, functioncode: int) -> int:
    low = instrument.read_register(address, number_of_decimals=0, functioncode=functioncode, signed=False)
    high = instrument.read_register(address + 1, number_of_decimals=0, functioncode=functioncode, signed=False)
    return (high << 16) | low


def _read_xy_md02(instrument: minimalmodbus.Instrument) -> dict[str, float]:
    instrument.address = XY_SLAVE_ADDRESS
    last_error: Exception | None = None
    for attempt in range(1, MAX_READ_RETRIES + 1):
        try:
            humidity = instrument.read_register(
                HUMIDITY_REGISTER, number_of_decimals=1, functioncode=XY_READ_FUNCTION_CODE, signed=False
            )
            temperature = instrument.read_register(
                TEMPERATURE_REGISTER, number_of_decimals=1, functioncode=XY_READ_FUNCTION_CODE, signed=True
            )
            return {"temperature": temperature, "humidity": humidity}
        except (minimalmodbus.ModbusException, serial.SerialException, OSError) as exc:
            last_error = exc
            log.warning("XY-MD02 read attempt %d/%d failed: %s", attempt, MAX_READ_RETRIES, exc)
            time.sleep(RETRY_DELAY_SECONDS)
    log.warning("XY-MD02 read failed after %d attempts, skipping this cycle: %s", MAX_READ_RETRIES, last_error)
    return {}


def _read_pzem(instrument: minimalmodbus.Instrument) -> dict[str, float]:
    instrument.address = PZEM_SLAVE_ADDRESS
    last_error: Exception | None = None
    for attempt in range(1, MAX_READ_RETRIES + 1):
        try:
            voltage = instrument.read_register(
                PZEM_VOLTAGE_REGISTER, number_of_decimals=1, functioncode=PZEM_READ_FUNCTION_CODE, signed=False
            )
            current = _read_u32(instrument, PZEM_CURRENT_REGISTER, PZEM_READ_FUNCTION_CODE) / 1000
            power = _read_u32(instrument, PZEM_POWER_REGISTER, PZEM_READ_FUNCTION_CODE) / 10
            energy = _read_u32(instrument, PZEM_ENERGY_REGISTER, PZEM_READ_FUNCTION_CODE) / 1000
            frequency = instrument.read_register(
                PZEM_FREQUENCY_REGISTER, number_of_decimals=1, functioncode=PZEM_READ_FUNCTION_CODE, signed=False
            )
            power_factor = instrument.read_register(
                PZEM_POWER_FACTOR_REGISTER, number_of_decimals=2, functioncode=PZEM_READ_FUNCTION_CODE, signed=False
            )
            return {
                "voltage": voltage,
                "current": current,
                "power": power,
                "energy": energy,
                "frequency": frequency,
                "power_factor": power_factor,
            }
        except (minimalmodbus.ModbusException, serial.SerialException, OSError) as exc:
            last_error = exc
            log.warning("PZEM-016 read attempt %d/%d failed: %s", attempt, MAX_READ_RETRIES, exc)
            time.sleep(RETRY_DELAY_SECONDS)
    log.warning("PZEM-016 read failed after %d attempts, skipping this cycle: %s", MAX_READ_RETRIES, last_error)
    return {}


def read(instrument: minimalmodbus.Instrument) -> dict[str, float]:
    """Returns whichever of the two devices' metrics succeeded this cycle.

    Raises only if BOTH devices failed - a single-device failure still
    reports the other device's metrics instead of dropping the whole cycle.
    """
    metrics: dict[str, float] = {}
    metrics.update(_read_xy_md02(instrument))
    metrics.update(_read_pzem(instrument))
    if not metrics:
        raise RuntimeError("Both XY-MD02 and PZEM-016 reads failed this cycle")
    return metrics
