# คู่มือติดตั้งระบบ: เซนเซอร์ RS485 → Raspberry Pi → เว็บแดชบอร์ด (Vercel)

## ภาพรวมระบบ

```
[เซนเซอร์ Modbus RTU]
        │ RS485 (สาย A/B)
[ตัวแปลง RS485-to-USB]
        │ USB
[Raspberry Pi 4]  --- sensor_reader.py + profiles/<sensor_type>.py (อ่านค่า, ส่ง HTTPS POST ทุก 1-5 นาที)
        │ อินเทอร์เน็ต (Wi-Fi/Ethernet)
[Vercel: /api/ingest]  --- ตรวจสอบ API key + sensor_type แล้วบันทึกลง DB
        │
[Supabase Postgres: ตาราง devices + readings]
        │
[Vercel: หน้า Overview (/)]  --- ค่าล่าสุดของทุกเซนเซอร์แบบเรียลไทม์
        │ กดที่เซนเซอร์ตัวใดตัวหนึ่ง
[Vercel: หน้า Dashboard (/sensors/[deviceId])]  --- กราฟ/สถิติ/ย้อนหลังของเซนเซอร์ตัวนั้น
```

โค้ดเว็บทั้งหมดอยู่ใน repo นี้แล้ว (Next.js) โค้ดฝั่ง Pi อยู่ในโฟลเดอร์ `raspberry-pi/`

ระบบรองรับ**เซนเซอร์หลายตัว หลายชนิด** พร้อมกัน — แต่ละชนิดมี "profile" (ไฟล์เล็กใน `raspberry-pi/profiles/`) บอกวิธีอ่านค่าเฉพาะของมัน ส่วนฐานข้อมูล/API/หน้าเว็บใช้ระบบเดียวกันหมดไม่ว่าจะเป็นเซนเซอร์ชนิดไหน เพิ่มเซนเซอร์ตัวใหม่ (ชนิดเดิมหรือชนิดใหม่) ทำได้โดยไม่ต้องแก้เว็บเลยถ้าเป็นชนิดที่มี profile อยู่แล้ว (ดูส่วนที่ 4 ข้อ 8)

---

## ส่วนที่ 1: ต่อฮาร์ดแวร์

1. เซนเซอร์วัดอุณหภูมิ/ความชื้นแบบ Modbus RTU (เช่น XY-MD02) มีสาย 4 เส้น: **VCC, GND, A, B**
2. ต่อไฟเลี้ยงเซนเซอร์ (ปกติ 5-24V DC ตามสเปกเซนเซอร์ - ดูจากฉลาก/คู่มือของรุ่นที่ซื้อมา)
3. ต่อสาย **A ↔ A** และ **B ↔ B** เข้ากับตัวแปลง RS485-to-USB (อย่าสลับ A/B)
4. ถ้าใช้สายยาวเกิน ~10 เมตร หรือมีปัญหาสัญญาณรบกวน ให้ใส่ตัวต้านทาน termination 120Ω คร่อมขา A-B ที่ปลายสาย
5. เสียบตัวแปลง USB เข้า Raspberry Pi 4
6. เปิด Pi แล้วเช็คว่าเจออุปกรณ์:
   ```bash
   ls /dev/serial/by-id/
   ```
   จะเห็นชื่อคล้าย `usb-1a86_USB_Serial-if00-port0` ให้จดพาธเต็มไว้ (แนะนำให้ใช้พาธนี้แทน `/dev/ttyUSB0` เพราะจะไม่เปลี่ยนชื่อเวลาถอด-เสียบใหม่)

---

## ส่วนที่ 2: ตั้งค่า Supabase (ฐานข้อมูล)

1. สมัคร/ล็อกอิน https://supabase.com แล้วสร้างโปรเจกต์ใหม่ (เลือก region ใกล้ผู้ใช้งาน เช่น Singapore)
2. รอจนโปรเจกต์พร้อมใช้งาน (2-3 นาที)
3. ไปที่เมนู **SQL Editor** → New query → คัดลอกเนื้อหาไฟล์ `supabase/schema.sql` ในโปรเจกต์นี้ไปวาง แล้วกด Run
   - สร้างตาราง `devices` (รายชื่อเซนเซอร์ทุกตัว สร้างอัตโนมัติตอน Pi ส่งข้อมูลครั้งแรก ไม่ต้อง insert เอง) และ `readings` (เก็บค่าแบบยืดหยุ่น รองรับเซนเซอร์ต่างชนิดกันในตารางเดียว)
   - สร้างฟังก์ชัน `get_bucketed_readings` (ย่อข้อมูลตอนดูช่วงยาวๆ ให้กราฟลื่นและโหลดเร็ว) และ `get_latest_readings` (ค่าล่าสุดของทุกเซนเซอร์ ใช้กับหน้า Overview)
   - ⚠️ สคริปต์นี้ `drop table`/`drop function` ก่อนสร้างใหม่ทุกครั้ง — ถ้ามีข้อมูลเก่าที่ต้องเก็บไว้ อย่ารันซ้ำโดยไม่สำรองข้อมูลก่อน
4. ไปที่ **Project Settings → API** แล้วจดค่า 2 อย่าง:
   - **Project URL** → ใช้เป็น `SUPABASE_URL`
   - **service_role key** (ไม่ใช่ anon key) → ใช้เป็น `SUPABASE_SERVICE_ROLE_KEY`
   - ⚠️ **ห้ามเผยแพร่ service_role key** มันข้ามการป้องกัน Row Level Security ได้ทั้งหมด ใช้เฉพาะฝั่งเซิร์ฟเวอร์ (Vercel env var) เท่านั้น

---

## ส่วนที่ 3: Deploy เว็บขึ้น Vercel

1. สร้าง repo บน GitHub แล้ว push โค้ดโปรเจกต์นี้ขึ้นไป (ถ้ายังไม่เคย push):
   ```bash
   git init
   git add .
   git commit -m "Initial sensor dashboard"
   git branch -M main
   git remote add origin <URL ของ repo คุณ>
   git push -u origin main
   ```
2. ไปที่ https://vercel.com → New Project → เลือก repo นี้ → Import
3. ก่อนกด Deploy ให้ตั้งค่า **Environment Variables** (Project Settings → Environment Variables) ตามนี้:

   | Key | Value |
   |---|---|
   | `SUPABASE_URL` | URL จากขั้นตอนที่แล้ว |
   | `SUPABASE_SERVICE_ROLE_KEY` | service_role key จากขั้นตอนที่แล้ว |
   | `INGEST_API_KEY` | สุ่มสตริงยาวๆ เอง เช่นรันคำสั่ง `openssl rand -hex 32` (ใช้ค่าเดียวกันนี้ในฝั่ง Pi ด้วย) |
   | `DEFAULT_DEVICE_ID` | `room-1` (หรือชื่อห้อง/จุดวัดที่ต้องการ) |

4. กด Deploy รอสักครู่ จะได้ URL เช่น `https://your-project.vercel.app`
5. เข้า URL นั้นดู — หน้าเว็บควรขึ้นมาได้ (ตอนนี้ยังไม่มีข้อมูล เพราะ Pi ยังไม่ได้ส่ง)

> การแก้ไขโค้ดในอนาคต: แค่ `git push` ขึ้น branch `main` Vercel จะ deploy ให้อัตโนมัติ

---

## ส่วนที่ 4: ตั้งค่า Raspberry Pi

1. ติดตั้ง Raspberry Pi OS (แนะนำ Lite ถ้าไม่ใช้หน้าจอ) ผ่าน Raspberry Pi Imager, เปิด SSH ไว้ตอน flash
2. SSH เข้า Pi แล้วอัปเดตระบบ:
   ```bash
   sudo apt update && sudo apt upgrade -y
   sudo apt install -y python3-venv python3-pip git
   ```
3. คัดลอกโฟลเดอร์ `raspberry-pi/` จากโปรเจกต์นี้ไปไว้ที่ Pi เช่น `/home/pi/sensor-dashboard/`
   (วิธีง่ายสุด: `git clone` repo เดียวกับที่ push ขึ้น GitHub ในขั้นตอนที่ 3 แล้วเข้าไปที่โฟลเดอร์ `raspberry-pi`)
4. สร้าง virtual environment แล้วติดตั้ง dependencies:
   ```bash
   cd /home/pi/sensor-dashboard/raspberry-pi
   python3 -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   ```
5. ให้สิทธิ์ผู้ใช้ `pi` เข้าถึงพอร์ต serial (ทำครั้งเดียว แล้ว logout/login ใหม่):
   ```bash
   sudo usermod -aG dialout pi
   ```
6. คัดลอกไฟล์ตั้งค่า แล้วแก้ให้ตรงกับของจริง:
   ```bash
   cp .env.example .env
   nano .env
   ```
   แก้ค่าเหล่านี้:
   - `SENSOR_TYPE` → ชื่อ profile ที่จะใช้อ่านเซนเซอร์นี้ (ค่า default `temp_humidity_xy_md02` ตรงกับไฟล์ `profiles/temp_humidity_xy_md02.py`)
   - `SERIAL_PORT` → พาธที่ได้จาก `ls /dev/serial/by-id/` ในส่วนที่ 1
   - `API_URL` → `https://your-project.vercel.app/api/ingest`
   - `API_KEY` → ค่าเดียวกับ `INGEST_API_KEY` ที่ตั้งใน Vercel
   - `DEVICE_ID` → ชื่อไม่ซ้ำของจุดวัดนี้ (เช่น `room-1`, `room-2`) — ใช้เป็น url ของหน้า Dashboard (`/sensors/<DEVICE_ID>`) ด้วย
   - `DEVICE_LABEL` → ชื่อที่อยากให้แสดงบนเว็บ (เช่น "ห้องนอน") ไม่ใส่ก็ได้ จะโชว์ `DEVICE_ID` แทน
   - `HUMIDITY_REGISTER` / `TEMPERATURE_REGISTER` → ค่าเริ่มต้นตรงกับเซนเซอร์ XY-MD02 ถ้าใช้รุ่นอื่น (แต่ยังเป็นเซนเซอร์อุณหภูมิ/ความชื้น) ให้เช็ค register address จาก datasheet ของเซนเซอร์นั้น
7. ทดสอบรันด้วยมือก่อน (ยังไม่ต้องตั้งเป็น service):
   ```bash
   python sensor_reader.py
   ```
   ควรเห็น log แบบ `Reading: {'temperature': 28.4, 'humidity': 58.2}` ทุกรอบ และไม่มี error แดง ถ้า error เรื่อง Modbus timeout ให้เช็คสาย A/B และที่อยู่ slave address (`SLAVE_ADDRESS` ต้องตรงกับที่ตั้งไว้ในตัวเซนเซอร์เอง ปกติ default คือ 1) ถ้า error ว่าไม่เจอ profile ให้เช็คว่า `SENSOR_TYPE` สะกดตรงกับชื่อไฟล์ใน `profiles/` (ไม่รวม `.py`)
   กด `Ctrl+C` เพื่อหยุดหลังทดสอบพอใจ
8. เปิดหน้าเว็บ (หน้า Overview) ควรเห็นการ์ดของอุปกรณ์นี้ขึ้นมาพร้อมค่าล่าสุด กดที่การ์ดเพื่อดูกราฟ/ประวัติย้อนหลัง — ถ้าเห็นแปลว่าทั้งระบบเชื่อมกันสำเร็จ

**เพิ่มเซนเซอร์ตัวที่สอง (ชนิดเดิมหรือชนิดใหม่):**
- **ชนิดเดิม** (เช่น XY-MD02 อีกตัวติดอีกห้อง): ทำซ้ำขั้นตอน 3-8 ในโฟลเดอร์ใหม่บน Pi (หรือ Pi เครื่องใหม่) โดยตั้ง `.env` ให้มี `DEVICE_ID`/`DEVICE_LABEL` ไม่ซ้ำกับตัวเดิม (และ `SLAVE_ADDRESS` ต่างกันถ้าใช้สาย RS485 เส้นเดียวกัน) — ไม่ต้องแก้โค้ดเว็บเลย จะขึ้นเป็นการ์ดใหม่ในหน้า Overview เอง
- **ชนิดใหม่** (เซนเซอร์วัดค่าอื่น เช่นกระแสไฟ): ต้องเพิ่มไฟล์ `profiles/<ชื่อชนิด>.py` ใหม่ (ดูโครงจาก `profiles/temp_humidity_xy_md02.py`) และเพิ่ม entry ใน `src/lib/metrics.ts`/`src/lib/sensorTypes.ts` ฝั่งเว็บก่อน — งานนี้แนะนำให้ขอความช่วยเหลือตอนถึงเวลาจริง (ต้องมี datasheet ของเซนเซอร์ชนิดนั้น)

---

## ส่วนที่ 5: ตั้งให้ Pi รันอัตโนมัติตลอดเวลา (systemd)

1. แก้ไฟล์ `sensor-dashboard.service` ถ้า path หรือ user ไม่ตรงกับเครื่องจริง (ค่าเริ่มต้นสมมติ user `pi` และโฟลเดอร์ `/home/pi/sensor-dashboard`)
2. ติดตั้ง service:
   ```bash
   sudo cp sensor-dashboard.service /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemctl enable sensor-dashboard
   sudo systemctl start sensor-dashboard
   ```
3. เช็คสถานะ / ดู log:
   ```bash
   sudo systemctl status sensor-dashboard
   journalctl -u sensor-dashboard -f
   ```
4. ตอนนี้ถ้า Pi รีบูตหรือสคริปต์ค้าง มันจะเริ่มใหม่อัตโนมัติ (`Restart=always`)

---

## ส่วนที่ 6: ทดสอบระบบทั้งหมด

- **หน้า Overview (`/`)**: ควรเห็นการ์ดของทุกอุปกรณ์ที่เคยส่งข้อมูลเข้ามา พร้อมค่าล่าสุดของแต่ละ metric อัปเดตอัตโนมัติทุก 30 วินาที
- **หน้า Dashboard รายตัว (`/sensors/<device_id>`)**: กดที่การ์ดจากหน้า Overview ควรเห็น "ค่าปัจจุบัน/ค่าเฉลี่ย/ช่วงต่ำสุด-สูงสุด" อัปเดตทุก 1-5 นาทีตาม `SEND_INTERVAL_SECONDS`
- **ทดสอบขาดการเชื่อมต่อ**: ถอดสาย LAN/Wi-Fi ของ Pi ชั่วคราว แล้วดูว่า badge บนเว็บเปลี่ยนเป็น "ขาดการเชื่อมต่อ" หลัง 5 นาทีที่ไม่มีข้อมูลใหม่ ข้อมูลที่อ่านได้ระหว่างขาดเน็ตจะถูกเก็บไว้ในไฟล์ `buffer.sqlite3` บน Pi แล้วส่งย้อนหลังให้เองเมื่อเน็ตกลับมา
- **ดูข้อมูลย้อนหลัง**: กดปุ่มช่วงเวลา (1 ชั่วโมง / 24 ชั่วโมง / 7 วัน / 30 วัน / ข้อมูลย้อนหลัง (เลือกวัน) / กำหนดเอง) กราฟและตารางจะอัปเดตตามช่วงที่เลือก กดปุ่ม "ดาวน์โหลด CSV" เพื่อเอาข้อมูลออกไปวิเคราะห์ต่อได้

---

## แก้ปัญหาที่พบบ่อย

| อาการ | สาเหตุที่เป็นไปได้ | วิธีแก้ |
|---|---|---|
| `Modbus read attempt` timeout ตลอด | สาย A/B สลับกัน, slave address ผิด, baud rate ไม่ตรง | เช็ค datasheet เซนเซอร์, ลองสลับ A/B, ยืนยัน `SLAVE_ADDRESS`/`BAUDRATE` |
| `No profiles/<x>.py found for SENSOR_TYPE=<x>` | สะกด `SENSOR_TYPE` ผิด หรือยังไม่มีไฟล์ profile นั้นจริง | เช็คว่ามีไฟล์ `raspberry-pi/profiles/<x>.py` อยู่จริง ชื่อไฟล์ต้องตรงกับ `SENSOR_TYPE` เป๊ะ (ไม่รวม `.py`) |
| เว็บขึ้น "unauthorized" ตอน Pi ส่งข้อมูล | `API_KEY` ฝั่ง Pi ไม่ตรงกับ `INGEST_API_KEY` ใน Vercel | ตรวจสอบให้เหมือนกันทุกตัวอักษร (ไม่มีช่องว่างเกิน) |
| เว็บขึ้น "unknown or missing sensor_type" | `SENSOR_TYPE` ฝั่ง Pi ไม่ได้ถูกเพิ่มไว้ใน `src/lib/sensorTypes.ts` ฝั่งเว็บ | เพิ่ม entry ให้ตรงกัน แล้ว deploy เว็บใหม่ |
| หน้า Overview ไม่มีการ์ดเลยทั้งที่ Pi รันอยู่ | Pi ยังไม่เคยส่งสำเร็จสักครั้ง (เช็ค log ของ Pi ว่า `send_payload` สำเร็จหรือยัง) หรือดู Vercel logs ของ `/api/ingest` | ดู `journalctl -u sensor-dashboard -f` บน Pi และ log ฝั่ง Vercel ประกอบกัน |
| Permission denied ตอนเปิด serial port | ผู้ใช้ยังไม่อยู่กลุ่ม `dialout` | รัน `sudo usermod -aG dialout pi` แล้ว logout/login ใหม่ |
