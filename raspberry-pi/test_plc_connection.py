#!/usr/bin/env python3
"""
Diagnostic script: tests whether the Pi can talk to the Samkoon PLC
(FAT-16MT-DC-E) over RS485 as a Modbus RTU master, with the PLC acting as
slave (COM0 was configured as "Modbus slave", station number 1, 9600-8-N-1
in SamSoar2022 and downloaded to the PLC).

The exact mapping from the PLC's internal D registers to Modbus addresses
hasn't been confirmed yet for this unit - a first attempt (function code
03, address 0) got "illegal data address" back, which means the PLC DID
receive and understand the request (wiring/station/baud are all correct)
but address 0 isn't valid for that function code. This version sweeps a
small range of addresses with both function code 03 (read holding
registers) and 04 (read input registers) to find which ones actually
respond, instead of guessing one address/function code at a time.

Run this with the PLC's COM0 screw-terminal A/B wired to a USB-RS485
adapter on the Pi (separate from the XY-MD02/PZEM adapter - don't share
that bus, this PLC defaults to station 1 which collides with XY-MD02).

Before running, open SamSoar2022's Monitor on D0 (and maybe D1-D5) so you
can watch live whether writes from this script actually change anything
in the PLC.

Edit PORT below, then:
    python3 test_plc_connection.py
"""

import time

import minimalmodbus
import serial

# Edit this to match your hardware before running.
PORT = "/dev/ttyUSB0"  # or the /dev/serial/by-id/... path - whichever adapter is wired to the PLC
STATION_NUMBER = 1  # matches COM0's "Station number" in SamSoar2022
SCAN_ADDRESSES = range(0, 21)  # D0..D20 - small range just to find what responds

inst = minimalmodbus.Instrument(PORT, STATION_NUMBER, mode=minimalmodbus.MODE_RTU)
inst.serial.baudrate = 9600
inst.serial.bytesize = 8
inst.serial.parity = serial.PARITY_NONE
inst.serial.stopbits = 1
inst.serial.timeout = 1

print(f"Scanning addresses {SCAN_ADDRESSES.start}-{SCAN_ADDRESSES.stop - 1} on station {STATION_NUMBER}...")
print()

found_fc03 = []
found_fc04 = []

for functioncode, found_list in ((3, found_fc03), (4, found_fc04)):
    fc_name = "03 (holding registers)" if functioncode == 3 else "04 (input registers)"
    print(f"--- Function code {fc_name} ---")
    for address in SCAN_ADDRESSES:
        try:
            value = inst.read_register(address, number_of_decimals=0, functioncode=functioncode, signed=False)
            print(f"  address {address}: responded, value = {value}")
            found_list.append(address)
        except minimalmodbus.ModbusException as exc:
            print(f"  address {address}: error - {exc}")
        except (serial.SerialException, OSError) as exc:
            print(f"  address {address}: COMMUNICATION FAILED - {exc}")
            print("  (stopping this function code's scan - check wiring/PORT)")
            break
        time.sleep(0.05)
    print()

print("=" * 60)
if not found_fc03 and not found_fc04:
    print("No address responded with either function code.")
    print("Every address returned 'illegal data address' (not a timeout), which still")
    print("means wiring/station/baud are correct - the PLC is just not exposing D0-D20")
    print("this way. Check SamSoar2022's SDO Modbus Tables / slave mapping settings again,")
    print("or check the PLC manual's Modbus mapping chapter for the real address scheme.")
    raise SystemExit(0)

if found_fc03:
    print(f"Function code 03 responded at: {found_fc03}")
if found_fc04:
    print(f"Function code 04 responded at: {found_fc04}")

# Try writing to the first address that responded on FC03 (writes only work
# on holding registers / FC03's address space, not FC04's read-only input
# registers), then read it back to confirm.
if found_fc03:
    test_address = found_fc03[0]
    test_value = 1234
    print()
    print(f"Testing write: address {test_address}, function code 06 (write single register)...")
    try:
        inst.write_register(test_address, test_value, number_of_decimals=0, functioncode=6, signed=False)
        time.sleep(0.2)
        after = inst.read_register(test_address, number_of_decimals=0, functioncode=3, signed=False)
        if after == test_value:
            print(f"  Success: address {test_address} now reads {after}.")
            print(f"  Go check SamSoar2022's Monitor - whichever D register shows {test_value} now")
            print(f"  is the one that corresponds to Modbus holding register address {test_address}.")
        else:
            print(f"  Wrote {test_value} but read back {after} - write may not be supported here.")
        inst.write_register(test_address, 0, number_of_decimals=0, functioncode=6, signed=False)
    except minimalmodbus.ModbusException as exc:
        print(f"  Write failed: {exc}")
