#!/usr/bin/env python3
"""
Diagnostic script: finds which Modbus holding register address (function
code 03) corresponds to the PLC's D0, by searching for a known, distinctive
value instead of guessing addresses blindly.

Setup before running:
  1. In SamSoar2022, close the "Monitor" window if it's open (having both
     the Monitor (over USB) and this script (over RS485) talking to the
     PLC at the same time seems to cause "device reports readiness to
     read but returned no data" errors - probably simple PLC firmware
     that can't service two communication requests at once).
  2. Use SamSoar2022's "Element Initialize" or "Monitor" (write mode) to
     set D0 to TEST_VALUE below (55555) directly through the software -
     not over Modbus. This gives us a known value to search for.
  3. Wire the PLC's COM0 screw-terminal A/B to a USB-RS485 adapter on the
     Pi (separate from the XY-MD02/PZEM adapter).

Then edit PORT below and run:
    python3 test_plc_connection.py

A first pass of addresses 0-9 all returned "illegal data address" (a real
Modbus exception, not a timeout) - so D registers exist somewhere past
that, just not at the address we guessed. This script sweeps a wide range
in coarse steps first, then narrows down once it finds TEST_VALUE.
"""

import time

import minimalmodbus
import serial

# Edit this to match your hardware before running.
PORT = "/dev/ttyUSB0"  # or the /dev/serial/by-id/... path - whichever adapter is wired to the PLC
STATION_NUMBER = 1  # matches COM0's "Station number" in SamSoar2022
TEST_VALUE = 55555  # set D0 to this value in SamSoar2022 before running

# D register range on this PLC is documented as 0-8303 (SamSoar2022 Project
# Setting > Device > More info). Sweep the whole plausible Modbus address
# space generously past that in case of an offset.
COARSE_MAX = 10000
COARSE_STEP = 50

inst = minimalmodbus.Instrument(PORT, STATION_NUMBER, mode=minimalmodbus.MODE_RTU)
inst.serial.baudrate = 9600
inst.serial.bytesize = 8
inst.serial.parity = serial.PARITY_NONE
inst.serial.stopbits = 1
inst.serial.timeout = 1


def try_read(address: int) -> int | None:
    try:
        return inst.read_register(address, number_of_decimals=0, functioncode=3, signed=False)
    except minimalmodbus.ModbusException:
        return None
    except (serial.SerialException, OSError) as exc:
        print(f"  COMMUNICATION FAILED at address {address}: {exc}")
        print("  Stopping - check wiring/PORT, and make sure SamSoar2022's Monitor is closed.")
        raise SystemExit(1)


print(f"Looking for D0's value ({TEST_VALUE}) somewhere in addresses 0-{COARSE_MAX}...")
print(f"(coarse pass, step {COARSE_STEP} - this takes a few minutes)")
print()

candidates = []
checked = 0
for address in range(0, COARSE_MAX + 1, COARSE_STEP):
    value = try_read(address)
    checked += 1
    if value is not None:
        print(f"  address {address}: responded, value = {value}")
        if value == TEST_VALUE:
            candidates.append(address)
    time.sleep(0.03)

print(f"\nCoarse pass done ({checked} addresses checked).")

if not candidates:
    print(f"\nDidn't find {TEST_VALUE} anywhere in the coarse pass.")
    print("Either D0 wasn't actually set to this value in SamSoar2022, or the real")
    print("address is in a gap the coarse step skipped over, or D registers use a")
    print("completely different function code/addressing scheme than guessed here.")
    raise SystemExit(0)

print(f"\nFound candidate(s) near: {candidates}")
print("Narrowing down with a fine sweep around each candidate...")

for center in candidates:
    print(f"\n--- fine sweep around {center} ---")
    lo = max(0, center - COARSE_STEP)
    hi = center + COARSE_STEP
    for address in range(lo, hi + 1):
        value = try_read(address)
        if value == TEST_VALUE:
            print(f"  *** address {address} == {TEST_VALUE} - this is D0! ***")
        time.sleep(0.03)
