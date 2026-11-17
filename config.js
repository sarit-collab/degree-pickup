// ===== ตั้งค่าระบบ =====
// API_URL: URL ของ Web App จาก Google Apps Script (ลงท้ายด้วย /exec)
// LIFF_ID: LIFF ID จาก LINE Developers (เช่น 2001234567-AbCdEfGh)
// ถ้าเว้น API_URL ว่างไว้ ระบบจะทำงานใน "โหมดทดลอง" (เก็บข้อมูลในเบราว์เซอร์นี้เท่านั้น, รหัสผู้ดูแล = admin)
window.CONFIG = {
  API_URL: 'https://script.google.com/macros/s/AKfycbwDwNwGVI67E2t9bF7vATjHNof82RzqB2L6UO8EZ3Zmb5QtkPrI4v2--AqNz5uy_yKZKw/exec',
  LIFF_ID: '2012657238-eDjIQi1j',

  // ต้องตรงกับ PREFIXES ใน Code.gs (เลือก "อื่น ๆ" แล้วพิมพ์เองได้)
  PREFIXES: ['นาย', 'นาง', 'นางสาว'],

  // ต้องตรงกับ STATUSES ใน Code.gs
  STATUSES: ['รอตรวจสอบ', 'รับเรื่องแล้ว', 'จัดส่งไปวังท่าพระแล้ว', 'พร้อมรับที่วังท่าพระ', 'รับปริญญาบัตรแล้ว', 'ไม่อนุมัติ'],
  CLOSED_STATUSES: ['รับปริญญาบัตรแล้ว', 'ไม่อนุมัติ'],

  CUTOFF_HOUR: 9, // ส่งหลัง 09:00 น. → รอบวันทำการถัดไป (ต้องตรงกับ Code.gs)
  REFRESH_SECONDS: 30,
};
CONFIG.DEMO = !CONFIG.API_URL;
