#!/usr/bin/env python3
"""
One-time setup script: changes a PZEM-016's Modbus slave address.

PZEM-016 units ship from the factory at address 1 - the same default as
XY-MD02. Since both devices will share one RS485 bus (see
profiles/room_climate_power.py), the PZEM must be moved to a different
address before being wired alongside the XY-MD02.

Run this ONCE, with the PZEM as the ONLY device on the bus (disconnect the
XY-MD02 first, or do this before wiring them together). Edit PORT,
CURRENT_ADDRESS, and NEW_ADDRESS below to match your setup, then:
    python set_pzem_address.py

CURRENT_ADDRESS is usually 1 (factory default) unless you already changed
it. NEW_ADDRESS must not collide with any other device's address on the
same bus (profiles/room_climate_power.py defaults to XY-MD02=1, PZEM=2).
"""

import minimalmodbus
import serial

# Edit these three to match your hardware before running.
PORT = "/dev/ttyUSB0"  # or the /dev/serial/by-id/... path - see SETUP_GUIDE.md
CURRENT_ADDRESS = 1
NEW_ADDRESS = 2

PZEM_ADDRESS_REGISTER = 0x0000  # holding register, function code 03 read / 06 write

inst = minimalmodbus.Instrument(PORT, CURRENT_ADDRESS, mode=minimalmodbus.MODE_RTU)
inst.serial.baudrate = 9600
inst.serial.bytesize = 8
inst.serial.parity = serial.PARITY_NONE
inst.serial.stopbits = 1
inst.serial.timeout = 1

print(f"Reading current address from slave {CURRENT_ADDRESS}...")
current = inst.read_register(PZEM_ADDRESS_REGISTER, number_of_decimals=0, functioncode=3, signed=False)
print(f"Device reports address: {current}")

print(f"Writing new address {NEW_ADDRESS}...")
inst.write_register(PZEM_ADDRESS_REGISTER, NEW_ADDRESS, number_of_decimals=0, functioncode=6, signed=False)

print("Verifying by reading back from the new address...")
inst.address = NEW_ADDRESS
verify = inst.read_register(PZEM_ADDRESS_REGISTER, number_of_decimals=0, functioncode=3, signed=False)
if verify == NEW_ADDRESS:
    print(f"Success: PZEM is now at address {NEW_ADDRESS}")
else:
    print(f"WARNING: expected {NEW_ADDRESS} but device reports {verify} - check wiring and retry")
