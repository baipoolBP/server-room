#!/usr/bin/env python3
"""
Diagnostic script: isolates why writing to the PLC's D0 (Modbus address
40000) fails with "illegal data address" even though reading the same
address (function code 03) succeeds.

Tries function code 06 (write single register) and function code 16
(write multiple registers, with a register count of 1) separately, since
some PLC Modbus-slave implementations only support one or the other
despite documentation claiming 06 works.

Setup: SamSoar2022's Monitor must be closed/disconnected before running
this (interferes with the RS485 link otherwise - see earlier notes).

Edit PORT below, then:
    python3 test_plc_write.py
"""

import minimalmodbus
import serial

PORT = "/dev/ttyUSB0"  # edit to match the PLC's adapter
STATION_NUMBER = 1
D0_ADDRESS = 40000
TEST_VALUE = 777

inst = minimalmodbus.Instrument(PORT, STATION_NUMBER, mode=minimalmodbus.MODE_RTU)
inst.serial.baudrate = 9600
inst.serial.bytesize = 8
inst.serial.parity = serial.PARITY_NONE
inst.serial.stopbits = 1
inst.serial.timeout = 1


def read_d0() -> int | None:
    try:
        return inst.read_register(D0_ADDRESS, number_of_decimals=0, functioncode=3, signed=False)
    except minimalmodbus.ModbusException as exc:
        print(f"  read failed: {exc}")
        return None


print(f"D0 before: {read_d0()}")

print(f"\nTrying write with function code 06 (write single register), value={TEST_VALUE}...")
try:
    inst.write_register(D0_ADDRESS, TEST_VALUE, number_of_decimals=0, functioncode=6, signed=False)
    print("  Call returned without raising.")
except minimalmodbus.ModbusException as exc:
    print(f"  FAILED: {exc}")
print(f"  D0 after: {read_d0()}")

print(f"\nTrying write with function code 16 (write multiple registers), value={TEST_VALUE + 1}...")
try:
    inst.write_register(D0_ADDRESS, TEST_VALUE + 1, number_of_decimals=0, functioncode=16, signed=False)
    print("  Call returned without raising.")
except minimalmodbus.ModbusException as exc:
    print(f"  FAILED: {exc}")
print(f"  D0 after: {read_d0()}")

print(f"\nTrying write_registers() (plural, explicit list) with function code 16, value=[{TEST_VALUE + 2}]...")
try:
    inst.write_registers(D0_ADDRESS, [TEST_VALUE + 2])
    print("  Call returned without raising.")
except minimalmodbus.ModbusException as exc:
    print(f"  FAILED: {exc}")
print(f"  D0 after: {read_d0()}")
