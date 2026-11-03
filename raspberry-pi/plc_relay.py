"""
Relays the Pi's sensor readings to the Samkoon PLC (FAT-16MT-DC-E) so the
PLC can forward them wirelessly to the SK-070QS HMI for on-site display.

This is a separate RS485 link from the one used to read XY-MD02/PZEM-016 -
wire the PLC's COM0 screw-terminal A/B to its OWN USB-RS485 adapter on the
Pi, not the sensor bus (COM0 defaults to Modbus slave station 1, which
would collide with XY-MD02's station 1 on the sensor bus).

Register map (confirmed empirically against the real PLC - see
PROJECT NOTES / memory for how this was found): the PLC's internal D
registers are exposed as Modbus holding registers at address
40000 + <D register number>, used literally (not the usual Modicon
"subtract 40001" convention). Function code 03 to read, 06 to write a
single register - function code 04 is not supported by this PLC.

Since each D register is a single 16-bit word, every metric here is
written as a scaled integer (e.g. temperature * 10) rather than a raw
float, and energy is written in whole kWh (not fractional) to keep
everything a one-register write - this is a simplification for a local
status display on the HMI, not a precision data store (the web dashboard
keeps full precision from the original /api/ingest payload).
"""

import logging
import os

import minimalmodbus
import serial

PLC_D0_MODBUS_ADDRESS = 40000  # D0 == this address, literally (see module docstring)

# metric_key -> (D register number, scale factor, signed)
# Scaled value = round(raw_value * scale). Keep max(abs(scaled)) comfortably
# inside a 16-bit register (signed: -32768..32767, unsigned: 0..65535).
PLC_REGISTER_MAP: dict[str, tuple[int, float, bool]] = {
    "temperature": (0, 10, True),  # -40.0..85.0 -> -400..850
    "humidity": (1, 10, False),  # 0..100.0 -> 0..1000
    "voltage": (2, 10, False),  # 0..300.0 -> 0..3000
    "current": (3, 100, False),  # 0..100.000 -> 0..10000 (precision reduced from 0.001 to 0.01 A)
    "power": (4, 1, False),  # whole watts, 0..25000
    "energy": (5, 1, False),  # whole kWh (fractional part dropped)
    "frequency": (6, 10, False),  # 0..100.0 -> 0..1000
    "power_factor": (7, 100, False),  # 0.00..1.00 -> 0..100
}

log = logging.getLogger("sensor_reader.plc_relay")


def build_plc_instrument() -> minimalmodbus.Instrument:
    port = os.environ["PLC_SERIAL_PORT"]
    station_number = int(os.environ.get("PLC_STATION_NUMBER", "1"))
    baudrate = int(os.environ.get("PLC_BAUDRATE", "9600"))

    instrument = minimalmodbus.Instrument(port, station_number, mode=minimalmodbus.MODE_RTU)
    instrument.serial.baudrate = baudrate
    instrument.serial.bytesize = 8
    instrument.serial.parity = serial.PARITY_NONE
    instrument.serial.stopbits = 1
    instrument.serial.timeout = 1
    instrument.clear_buffers_before_each_transaction = True
    return instrument


def write_metrics_to_plc(instrument: minimalmodbus.Instrument, metrics: dict[str, float]) -> None:
    """Writes whichever of `metrics` has a PLC_REGISTER_MAP entry. Logs and
    skips individual metrics that fail to write instead of raising, so one
    bad write doesn't stop the others or crash the caller's main loop."""
    for key, value in metrics.items():
        mapping = PLC_REGISTER_MAP.get(key)
        if mapping is None:
            continue
        d_register, scale, signed = mapping
        address = PLC_D0_MODBUS_ADDRESS + d_register
        scaled_value = round(value * scale)
        try:
            instrument.write_register(address, scaled_value, number_of_decimals=0, functioncode=6, signed=signed)
        except (minimalmodbus.ModbusException, serial.SerialException, OSError) as exc:
            log.warning("PLC write failed for %s (D%d, address %d): %s", key, d_register, address, exc)
