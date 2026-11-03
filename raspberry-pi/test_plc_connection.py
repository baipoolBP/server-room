#!/usr/bin/env python3
"""
Diagnostic script: tests whether the Pi can talk to the Samkoon PLC
(FAT-16MT-DC-E) over RS485 as a Modbus RTU master, with the PLC acting as
slave (COM0 was configured as "Modbus slave", station number 1, 9600-8-N-1
in SamSoar2022 and downloaded to the PLC).

This also tests a HYPOTHESIS we haven't confirmed yet: that the PLC's
internal D registers map 1:1 onto Modbus holding register addresses (i.e.
D0 = Modbus holding register address 0, D1 = address 1, etc). This mapping
is standard for Fatek-style PLCs (which Samkoon's FAT series closely
follows) but hasn't been verified against this specific unit yet.

Run this with the PLC's COM0 screw-terminal A/B wired to a USB-RS485
adapter on the Pi (separate from the XY-MD02/PZEM adapter - don't share
that bus, this PLC defaults to station 1 which collides with XY-MD02).

Edit PORT below, then:
    python3 test_plc_connection.py

What to watch for:
  - "Read D0" succeeding at all confirms basic connectivity + station
    number + baud/parity match.
  - The write-then-readback test confirms the D0-to-holding-register-0
    mapping hypothesis. If the write succeeds but the readback doesn't
    match, the mapping is probably offset by something (e.g. D registers
    might start at a different base address) - check SamSoar2022's online
    monitor (watch D0 live while this runs) to see what's actually
    happening on the PLC side.
"""

import time

import minimalmodbus
import serial

# Edit this to match your hardware before running.
PORT = "/dev/ttyUSB0"  # or the /dev/serial/by-id/... path - whichever adapter is wired to the PLC
STATION_NUMBER = 1  # matches COM0's "Station number" in SamSoar2022
D0_HOLDING_REGISTER = 0  # hypothesis: D0 == Modbus holding register address 0

inst = minimalmodbus.Instrument(PORT, STATION_NUMBER, mode=minimalmodbus.MODE_RTU)
inst.serial.baudrate = 9600
inst.serial.bytesize = 8
inst.serial.parity = serial.PARITY_NONE
inst.serial.stopbits = 1
inst.serial.timeout = 1

print(f"Reading D0 (holding register {D0_HOLDING_REGISTER}) from station {STATION_NUMBER}...")
try:
    before = inst.read_register(D0_HOLDING_REGISTER, number_of_decimals=0, functioncode=3, signed=False)
    print(f"  Success: D0 = {before}")
except (minimalmodbus.ModbusException, serial.SerialException, OSError) as exc:
    print(f"  FAILED: {exc}")
    print("  Check: wiring (A/B not swapped), PORT path, that COM0 was actually downloaded as")
    print("  Modbus slave/station 1/9600-8-N-1, and that nothing else is on this wire.")
    raise SystemExit(1)

test_value = 1234
print(f"Writing {test_value} to D0...")
inst.write_register(D0_HOLDING_REGISTER, test_value, number_of_decimals=0, functioncode=6, signed=False)
time.sleep(0.2)

print("Reading D0 back...")
after = inst.read_register(D0_HOLDING_REGISTER, number_of_decimals=0, functioncode=3, signed=False)
if after == test_value:
    print(f"  Success: D0 now reads {after} - D0 maps directly to holding register {D0_HOLDING_REGISTER}.")
else:
    print(f"  Unexpected: wrote {test_value} but read back {after}.")
    print("  The D-register-to-Modbus-address mapping may not be a direct 1:1 - open SamSoar2022's")
    print("  online monitor on D0 (and maybe D1/D2) while re-running this to see what's really changing.")

print()
print("Restoring D0 to 0...")
inst.write_register(D0_HOLDING_REGISTER, 0, number_of_decimals=0, functioncode=6, signed=False)
