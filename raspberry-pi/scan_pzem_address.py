#!/usr/bin/env python3
"""
Diagnostic script: scans Modbus slave addresses 1-247 to find which one a
connected PZEM-016 is currently answering on.

Use this before running set_pzem_address.py if you don't know (or aren't
sure of) the PZEM's current address - e.g. it's a used/already-configured
unit, or you're not sure the factory default (1) still applies.

Run with the PZEM as the ONLY device on the bus (disconnect the XY-MD02
first) so a response can only come from the PZEM. Edit PORT below, then:
    python scan_pzem_address.py

For each address, this reads the voltage register (0x0000) - if the PZEM
is wired to live AC power, a real address responds with a plausible
voltage (not a timeout/CRC error).
"""

import time

import minimalmodbus
import serial

# Edit this to match your hardware before running.
PORT = "/dev/ttyUSB0"  # or the /dev/serial/by-id/... path - see SETUP_GUIDE.md

PZEM_VOLTAGE_REGISTER = 0x0000
PZEM_READ_FUNCTION_CODE = 4

inst = minimalmodbus.Instrument(PORT, 1, mode=minimalmodbus.MODE_RTU)
inst.serial.baudrate = 9600
inst.serial.bytesize = 8
inst.serial.parity = serial.PARITY_NONE
inst.serial.stopbits = 1
inst.serial.timeout = 0.3  # short timeout so a 247-address scan doesn't take forever

found = []
print("Scanning addresses 1-247 (this takes a minute or two)...")
for address in range(1, 248):
    inst.address = address
    try:
        voltage = inst.read_register(
            PZEM_VOLTAGE_REGISTER, number_of_decimals=1, functioncode=PZEM_READ_FUNCTION_CODE, signed=False
        )
        print(f"  address {address}: responded, voltage = {voltage} V")
        found.append(address)
    except (minimalmodbus.ModbusException, serial.SerialException, OSError):
        pass  # no response at this address - expected for almost all of them
    time.sleep(0.05)

print()
if found:
    print(f"Found PZEM responding at address(es): {found}")
    print("Use this as CURRENT_ADDRESS in set_pzem_address.py.")
else:
    print("No address responded. Check wiring (A/B not swapped), baudrate, and that")
    print("the PZEM has live AC power connected (it needs mains power to run its")
    print("Modbus interface, separate from the RS485 data lines).")
