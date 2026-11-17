// ===== ส่วนกลาง: เรียก API, โหมดทดลอง, ตัวช่วยแสดงผล =====

function appError(message, code) {
  const err = new Error(message);
  err.code = code || 'ERROR';
  return err;
}

const Api = {
  async call(action, data) {
    if (CONFIG.DEMO) return Demo.handle(action, data || {});
    let res;
    try {
      // text/plain เพื่อไม่ให้เกิด CORS preflight กับ Apps Script
      res = await fetch(CONFIG.API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(Object.assign({ action }, data)),
      });
    } catch (e) {
      throw appError('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ต', 'NETWORK');
    }
    const json = await res.json().catch(() => null);
    if (!json) throw appError('เซิร์ฟเวอร์ตอบกลับไม่ถูกต้อง', 'SERVER');
    if (!json.ok) throw appError(json.error, json.code);
    return json.data;
  },
};

// ===== รอบจัดส่ง (เวลาไทย): ก่อน 09:00 วันทำการ = วันนี้, หลังจากนั้น/เสาร์-อาทิตย์ = วันทำการถัดไป =====
const Round = {
  bangkokParts(date) {
    const p = {};
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', hourCycle: 'h23', weekday: 'short',
    }).formatToParts(date).forEach(x => { p[x.type] = x.value; });
    return p;
  },
  of(now) {
    const isWeekend = d => ['Sat', 'Sun'].includes(Round.bangkokParts(d).weekday);
    const p = Round.bangkokParts(now);
    let d = new Date(now.getTime());
    if (isWeekend(d) || Number(p.hour) >= CONFIG.CUTOFF_HOUR) d = new Date(d.getTime() + 86400000);
    while (isWeekend(d)) d = new Date(d.getTime() + 86400000);
    const q = Round.bangkokParts(d);
    return `${q.year}-${q.month}-${q.day}`;
  },
  thai(ymd, long) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || ''));
    if (!m) return ymd || '-';
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 5));
    return d.toLocaleDateString('th-TH', {
      timeZone: 'Asia/Bangkok', day: 'numeric', month: long ? 'long' : 'short', year: 'numeric',
      weekday: long ? 'long' : undefined,
    });
  },
};

// โหมดทดลอง: จำลอง backend ด้วย localStorage
const Demo = {
  KEY: 'demo_degree_requests',
  load() {
    try { return JSON.parse(localStorage.getItem(this.KEY) || '[]'); } catch (e) { return []; }
  },
  save(rows) {
    try { localStorage.setItem(this.KEY, JSON.stringify(rows)); }
    catch (e) { throw appError('พื้นที่จัดเก็บของเบราว์เซอร์เต็ม (โหมดทดลอง)', 'STORAGE'); }
  },
  async handle(action, b) {
    await new Promise(r => setTimeout(r, 300));
    const rows = this.load();
    const now = new Date().toISOString();
    const find = id => {
      const r = rows.find(x => x.requestId === id);
      if (!r) throw appError('ไม่พบคำร้อง', 'NOT_FOUND');
      return r;
    };
    const admin = () => { if (b.adminToken !== 'demo-admin') throw appError('กรุณาเข้าสู่ระบบใหม่', 'ADMIN_AUTH'); };
    switch (action) {
      case 'submit': {
        const active = rows.find(r => !CONFIG.CLOSED_STATUSES.includes(r.status) && r.studentId === b.studentId);
        if (active) throw appError('มีคำร้องเลขที่ ' + active.requestId + ' (รหัส ' + active.studentId + ') ที่ยังดำเนินการอยู่ กรุณารอให้เสร็จก่อนยื่นใหม่', 'DUPLICATE');
        const p = Round.bangkokParts(new Date());
        const prefix = 'DG' + p.year.slice(2) + p.month + p.day + '-';
        const requestId = prefix + String(rows.filter(r => r.requestId.startsWith(prefix)).length + 1).padStart(4, '0');
        const status = CONFIG.STATUSES[0];
        const deliveryRound = Round.of(new Date());
        rows.push({
          requestId, createdAt: now, updatedAt: now, displayName: 'ผู้ทดลองใช้',
          prefix: b.prefix, firstName: b.firstName, lastName: b.lastName, studentId: b.studentId, phone: b.phone,
          deliveryRound, status, note: '',
          history: [{ at: now, status, note: 'ยื่นคำร้อง (รอบจัดส่ง ' + Round.thai(deliveryRound) + ')', by: 'ผู้ยื่นคำร้อง' }],
        });
        this.save(rows);
        return { requestId, status, deliveryRound };
      }
      case 'myRequests':
        return rows.slice().reverse();
      case 'adminList':
        admin();
        return rows.slice().reverse();
      case 'adminLogin':
        if (b.password !== 'admin') throw appError('รหัสผ่านไม่ถูกต้อง (โหมดทดลองใช้ admin)', 'AUTH');
        return { token: 'demo-admin' };
      case 'adminUpdate': {
        admin();
        const r = find(b.requestId);
        const moved = b.deliveryRound && b.deliveryRound !== r.deliveryRound;
        r.status = b.status;
        r.note = b.note || '';
        if (b.deliveryRound) r.deliveryRound = b.deliveryRound;
        r.updatedAt = now;
        r.history.push({ at: now, status: b.status, by: 'ผู้ดูแล', notified: b.notify !== false,
          note: [r.note, moved ? 'เปลี่ยนรอบจัดส่งเป็น ' + Round.thai(b.deliveryRound) : ''].filter(Boolean).join(' · ') });
        this.save(rows);
        return r;
      }
      case 'adminNotify': {
        admin();
        const r = find(b.requestId);
        r.history.push({ at: now, status: r.status, note: b.note || 'ส่งแจ้งเตือนซ้ำ', by: 'ผู้ดูแล', notified: true });
        this.save(rows);
        return r;
      }
      case 'adminBulkUpdate': {
        admin();
        const out = [];
        rows.forEach(r => {
          if (!b.requestIds.includes(r.requestId)) return;
          r.status = b.status;
          r.note = b.note || '';
          r.updatedAt = now;
          r.history.push({ at: now, status: b.status, note: r.note, by: 'ผู้ดูแล', notified: b.notify !== false });
          out.push(r);
        });
        this.save(rows);
        return out;
      }
    }
    throw appError('ไม่รู้จักคำสั่งนี้', 'BAD_ACTION');
  },
};

const UI = {
  $: s => document.querySelector(s),

  esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  },

  fmt(iso) {
    if (!iso) return '-';
    const d = new Date(iso);
    if (isNaN(d)) return '-';
    return d.toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok' });
  },

  badge(status) {
    const i = CONFIG.STATUSES.indexOf(status);
    return `<span class="badge s${i}">${UI.esc(status)}</span>`;
  },

  fullName(r) {
    return `${r.prefix || ''}${r.firstName || ''} ${r.lastName || ''}`.trim();
  },

  historyHtml(history) {
    return `<ol class="timeline">${(history || []).slice().reverse().map(h => `
      <li>
        <div class="tl-head">${UI.badge(h.status)} <span class="muted">${UI.esc(UI.fmt(h.at))} · ${UI.esc(h.by || '')}${h.notified ? ' · 🔔 แจ้ง LINE แล้ว' : ''}</span></div>
        ${h.note ? `<div class="tl-note">${UI.esc(h.note)}</div>` : ''}
      </li>`).join('')}</ol>`;
  },

  toast(msg, type) {
    let el = document.getElementById('toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.className = 'show ' + (type || '');
    clearTimeout(UI._toastTimer);
    UI._toastTimer = setTimeout(() => { el.className = ''; }, 4000);
  },

  initTheme(btn) {
    const root = document.documentElement;
    let saved = null;
    try { saved = localStorage.getItem('theme'); } catch (e) { /* ignore */ }
    if (saved) root.dataset.theme = saved;
    const isDark = () => root.dataset.theme
      ? root.dataset.theme === 'dark'
      : matchMedia('(prefers-color-scheme: dark)').matches;
    const label = () => { btn.textContent = isDark() ? '☀️' : '🌙'; btn.title = isDark() ? 'โหมดสว่าง' : 'โหมดมืด'; };
    label();
    btn.addEventListener('click', () => {
      root.dataset.theme = isDark() ? 'light' : 'dark';
      try { localStorage.setItem('theme', root.dataset.theme); } catch (e) { /* ignore */ }
      label();
    });
  },

  demoBanner() {
    if (!CONFIG.DEMO) return;
    const b = document.createElement('div');
    b.className = 'demo-banner';
    b.textContent = 'โหมดทดลอง — ข้อมูลเก็บในเบราว์เซอร์นี้เท่านั้น (ตั้งค่า API_URL ใน config.js เพื่อใช้งานจริง)';
    document.body.prepend(b);
  },
};
