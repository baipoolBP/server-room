#!/usr/bin/env python3
"""
Diagnostic script: tests whether D0 == Modbus holding register address
40000 on the Samkoon PLC, per a Thai Samkoon-distributor tutorial
(factonation.com/docs/plc/modbus/plc-samkoon-modbus-rs485) that documents
D-register-to-Modbus-address mapping as "D0 = 40000, no +1 needed" (i.e.
D(n) = 40000 + n, used as the literal address - NOT the usual Modicon
convention of subtracting 40001). A prior sweep of addresses 0-10000
found nothing, consistent with the real range starting way higher.

Setup before running:
  - D0 should currently hold 55555 (set earlier via SamSoar2022's Monitor,
    write mode) - if it's been reset, redo that first.
  - SamSoar2022's Monitor must be CLOSED (or USB unplugged) - it seems to
    hold a background connection to the PLC that causes intermittent
    "device reports readiness to read but returned no data" errors when
    something else (this script) talks to the PLC over RS485 at the same
    time.
  - PLC's COM0 screw-terminal A/B wired to a USB-RS485 adapter on the Pi
    (separate from the XY-MD02/PZEM adapter).

Then edit PORT below and run:
    python3 test_plc_connection.py
"""

import time

import minimalmodbus
import serial

# Edit this to match your hardware before running.
PORT = "/dev/ttyUSB0"  # or the /dev/serial/by-id/... path - whichever adapter is wired to the PLC
STATION_NUMBER = 1  # matches COM0's "Station number" in SamSoar2022
TEST_VALUE = 55555  # should already be set in D0 via SamSoar2022's Monitor

D0_CANDIDATE = 40000  # per factonation.com's Samkoon Modbus tutorial: D0 == 40000, used literally

inst = minimalmodbus.Instrument(PORT, STATION_NUMBER, mode=minimalmodbus.MODE_RTU)
inst.serial.baudrate = 9600
inst.serial.bytesize = 8
inst.serial.parity = serial.PARITY_NONE
inst.serial.stopbits = 1
inst.serial.timeout = 1


def try_read(address: int, functioncode: int = 3) -> int | None:
    try:
        return inst.read_register(address, number_of_decimals=0, functioncode=functioncode, signed=False)
    except minimalmodbus.ModbusException as exc:
        print(f"  address {address} (fc{functioncode}): illegal/error - {exc}")
        return None
    except (serial.SerialException, OSError) as exc:
        print(f"  address {address} (fc{functioncode}): comm glitch - {exc}")
        return None


print(f"Trying D0 at the documented address {D0_CANDIDATE} (function code 03)...")
value = try_read(D0_CANDIDATE, functioncode=3)
if value == TEST_VALUE:
    print(f"  *** MATCH: address {D0_CANDIDATE} == {TEST_VALUE} - this is D0! ***")
elif value is not None:
    print(f"  Responded, but value = {value} (expected {TEST_VALUE}) - D0 may not currently hold {TEST_VALUE}")
    print("  (check SamSoar2022's Monitor that D0 is still set to this value)")

if value != TEST_VALUE:
    print()
    print("Didn't get an exact match at the documented address - sweeping a small range")
    print(f"around {D0_CANDIDATE} in case of a small offset...")
    for offset in range(-5, 6):
        address = D0_CANDIDATE + offset
        if address == D0_CANDIDATE:
            continue  # already tried above
        v = try_read(address, functioncode=3)
        if v == TEST_VALUE:
            print(f"  *** MATCH: address {address} == {TEST_VALUE} - this is D0! ***")
        time.sleep(0.05)
    print()
    print("Also trying function code 04 at the documented address, in case 03 isn't right:")
    v = try_read(D0_CANDIDATE, functioncode=4)
    if v == TEST_VALUE:
        print(f"  *** MATCH: address {D0_CANDIDATE} with function code 04 == {TEST_VALUE} - this is D0! ***")
