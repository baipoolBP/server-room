#!/usr/bin/env python3
"""
Diagnostic script: scans a Modbus RTU sensor's registers to find which
function code (03 = holding registers, 04 = input registers) and register
addresses actually return sensible values.

Use this when setting up a new temperature/humidity sensor (or any Modbus
RTU sensor) and the defaults in profiles/temp_humidity_xy_md02.py don't work
- different manufacturers/clones of the "same" sensor sometimes disagree on
function code and/or register layout. Run this once by hand (not part of
the normal runtime), read off which (function code, register) pair gives a
plausible reading, then set HUMIDITY_REGISTER/TEMPERATURE_REGISTER/
READ_FUNCTION_CODE in .env to match.

Edit PORT/SLAVE below to match your setup before running:
    python scan_xy.py
"""

import time

import minimalmodbus
import serial

# Edit these two to match your hardware before running.
PORT = "/dev/ttyUSB0"  # or the /dev/serial/by-id/... path - see SETUP_GUIDE.md
SLAVE = 1

inst = minimalmodbus.Instrument(PORT, SLAVE, mode=minimalmodbus.MODE_RTU)
inst.serial.baudrate = 9600
inst.serial.bytesize = 8
inst.serial.parity = serial.PARITY_NONE
inst.serial.stopbits = 1
inst.serial.timeout = 1

for fc in [3, 4]:
    print("Function code", fc)
    for reg in range(0, 10):
        try:
            val = inst.read_register(reg, number_of_decimals=1, functioncode=fc, signed=True)
            print("reg", reg, "=", val)
        except Exception as e:
            print("reg", reg, "ERR", str(e))
        time.sleep(0.2)
