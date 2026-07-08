# Sensor Dashboard

เว็บแดชบอร์ดแสดงผลข้อมูลเซนเซอร์อุณหภูมิ/ความชื้นแบบเรียลไทม์ รับข้อมูลจาก Raspberry Pi ที่อ่านค่าจากเซนเซอร์ RS485 (Modbus RTU) แล้วส่งเข้ามาเก็บใน Supabase

**ดูวิธีติดตั้งระบบทั้งหมดตั้งแต่ต้น (ฮาร์ดแวร์ → Pi → Supabase → Vercel) ได้ที่ [`SETUP_GUIDE.md`](./SETUP_GUIDE.md)**

## โครงสร้างโปรเจกต์

- `src/app` - หน้าเว็บและ API routes (Next.js App Router)
  - `api/ingest` - endpoint ที่ Raspberry Pi ส่งข้อมูลเข้ามา (ต้องใช้ `x-api-key`)
  - `api/readings` - endpoint ที่หน้าเว็บใช้ดึงข้อมูลกราฟ/สถิติ/ตาราง
- `src/components` - UI ของแดชบอร์ด (stat card, กราฟ, ตัวเลือกช่วงเวลา, ตาราง)
- `src/lib` - Supabase client, การคำนวณช่วงเวลา/bucket, การจัดรูปแบบตัวเลข
- `supabase/schema.sql` - SQL สำหรับสร้างตารางและฟังก์ชันใน Supabase
- `raspberry-pi/` - โค้ด Python ที่รันบน Raspberry Pi (`sensor_reader.py`) พร้อม systemd service

## พัฒนาในเครื่อง

```bash
npm install
cp .env.local.example .env.local   # ใส่ค่า Supabase/API key ของตัวเอง
npm run dev
```

เปิด [http://localhost:3000](http://localhost:3000)

## Deploy

Push ขึ้น GitHub แล้ว import เข้า [Vercel](https://vercel.com/new) จากนั้นตั้งค่า environment variables ตามที่ระบุใน `.env.local.example` (ดูรายละเอียดใน `SETUP_GUIDE.md`)
