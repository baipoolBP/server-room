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

After this script reports success, power-cycle the PZEM once (AC off/on)
with nothing else touched, then run scan_pzem_address.py again - some
PZEM clones silently accept a write without actually persisting it, so a
reboot is the real test of whether the new address stuck.
"""

import minimalmodbus
import serial

# Edit these three to match your hardware before running.
PORT = "/dev/ttyUSB0"  # or the /dev/serial/by-id/... path - see SETUP_GUIDE.md
CURRENT_ADDRESS = 1
NEW_ADDRESS = 2

PZEM_ADDRESS_REGISTER = 0x0002  # holding register, function code 03 read / 06 write

inst = minimalmodbus.Instrument(PORT, CURRENT_ADDRESS, mode=minimalmodbus.MODE_RTU)
inst.serial.baudrate = 9600
inst.serial.bytesize = 8
inst.serial.parity = serial.PARITY_NONE
inst.serial.stopbits = 1
inst.serial.timeout = 1

def try_read(address: int) -> int | None:
    """Returns the register value if `address` responds, else None."""
    inst.address = address
    try:
        return inst.read_register(PZEM_ADDRESS_REGISTER, number_of_decimals=0, functioncode=3, signed=False)
    except (minimalmodbus.ModbusException, serial.SerialException, OSError):
        return None


print(f"Reading current address from slave {CURRENT_ADDRESS}...")
current = try_read(CURRENT_ADDRESS)
print(f"Device reports: {current}")

print(f"Writing new address {NEW_ADDRESS}...")
inst.address = CURRENT_ADDRESS
inst.write_register(PZEM_ADDRESS_REGISTER, NEW_ADDRESS, number_of_decimals=0, functioncode=6, signed=False)

print("Checking whether the new address responds immediately (not all devices do)...")
responds_at_new = try_read(NEW_ADDRESS) == NEW_ADDRESS
responds_at_old = try_read(CURRENT_ADDRESS) is not None

if responds_at_new and not responds_at_old:
    print(f"Success so far: PZEM answers at {NEW_ADDRESS} and no longer at {CURRENT_ADDRESS}.")
else:
    print(
        f"No live change yet (new address responds: {responds_at_new}, old still responds: "
        f"{responds_at_old}). This is often NORMAL - many Modbus devices only start using a "
        "new address after a power cycle, even though the write itself succeeded."
    )

print()
print("Next step either way: power-cycle the PZEM (AC off, wait a few seconds, AC back on),")
print("with nothing else touched, then run:")
print("    python3 scan_pzem_address.py")
print(f"If it now answers at {NEW_ADDRESS}, the change stuck. If it's still at {CURRENT_ADDRESS},")
print("this unit doesn't persist address changes to non-volatile memory and a different")
print("approach is needed (e.g. a second USB-RS485 adapter so each device keeps its own bus).")
