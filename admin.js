// ===== หน้าผู้ดูแล =====
const $ = UI.$;
let adminToken = null;
let allRows = [];
let statusFilter = '';
let current = null;
let refreshTimer = null;
const selected = new Set();

function init() {
  UI.initTheme($('#themeBtn'));
  UI.demoBanner();
  try { $('#sortBy').value = localStorage.getItem('adminSort') || 'round'; } catch (e) { /* ignore */ }
  const statusOpts = CONFIG.STATUSES.map(s => `<option>${UI.esc(s)}</option>`).join('');
  $('#dlgStatus').innerHTML = statusOpts;
  $('#bulkStatus').innerHTML = statusOpts;

  $('#loginForm').addEventListener('submit', onLogin);
  $('#logoutBtn').addEventListener('click', logout);
  $('#refreshBtn').addEventListener('click', () => load());
  $('#exportBtn').addEventListener('click', exportCsv);
  $('#printBtn').addEventListener('click', printList);
  $('#search').addEventListener('input', render);
  $('#roundFilter').addEventListener('change', render);
  $('#sortBy').addEventListener('change', () => {
    try { localStorage.setItem('adminSort', $('#sortBy').value); } catch (e) { /* ignore */ }
    render();
  });
  $('#checkAll').addEventListener('change', e => {
    filtered().forEach(r => { if (e.target.checked) selected.add(r.requestId); else selected.delete(r.requestId); });
    render();
  });
  $('#bulkClearBtn').addEventListener('click', () => { selected.clear(); render(); });
  $('#bulkSaveBtn').addEventListener('click', () => onBulk(false));
  $('#bulkNotifyBtn').addEventListener('click', () => onBulk(true));
  $('#dlgClose').addEventListener('click', () => $('#dlg').close());
  $('#holidayBtn').addEventListener('click', openHolidays);
  $('#holClose').addEventListener('click', () => $('#holDlg').close());
  $('#holForm').addEventListener('submit', addHoliday);
  $('#holPast').addEventListener('change', renderHolidays);
  $('#updateForm').addEventListener('submit', onUpdate);
  $('#notifyBtn').addEventListener('click', onNotify);

  try { adminToken = sessionStorage.getItem('adminToken'); } catch (e) { /* ignore */ }
  if (adminToken) enterDashboard();
}

async function adminCall(action, data) {
  try {
    return await Api.call(action, Object.assign({ adminToken }, data));
  } catch (e) {
    if (e.code === 'ADMIN_AUTH') logout();
    throw e;
  }
}

async function onLogin(e) {
  e.preventDefault();
  const btn = $('#loginBtn');
  btn.disabled = true;
  try {
    const res = await Api.call('adminLogin', { password: $('#password').value });
    adminToken = res.token;
    try { sessionStorage.setItem('adminToken', adminToken); } catch (err) { /* ignore */ }
    $('#password').value = '';
    enterDashboard();
  } catch (err) {
    UI.toast(err.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

function enterDashboard() {
  $('#loginView').hidden = true;
  $('#dashView').hidden = false;
  $('#logoutBtn').hidden = false;
  load();
  clearInterval(refreshTimer);
  refreshTimer = setInterval(() => {
    if (!document.hidden && !$('#dlg').open && !selected.size) load(true);
  }, CONFIG.REFRESH_SECONDS * 1000);
}

function logout() {
  adminToken = null;
  try { sessionStorage.removeItem('adminToken'); } catch (e) { /* ignore */ }
  clearInterval(refreshTimer);
  selected.clear();
  if ($('#dlg').open) $('#dlg').close();
  $('#loginView').hidden = false;
  $('#dashView').hidden = true;
  $('#logoutBtn').hidden = true;
}

async function load(silent) {
  if (!silent) $('#rows').innerHTML = '<tr><td colspan="9"><div class="spinner"></div></td></tr>';
  try {
    allRows = await adminCall('adminList');
    $('#lastUpdated').textContent = 'อัปเดตล่าสุด ' + UI.fmt(new Date().toISOString()) +
      ` · รีเฟรชอัตโนมัติทุก ${CONFIG.REFRESH_SECONDS} วินาที`;
    fillRounds();
    render();
  } catch (err) {
    if (!silent) UI.toast(err.message, 'error');
  }
}

/** ตัวเลือกรอบจัดส่ง: ทุกรอบที่มีคำร้อง (ใหม่สุดก่อน) */
function fillRounds() {
  const sel = $('#roundFilter');
  const keep = sel.value;
  const today = Round.of(new Date());
  const rounds = [...new Set(allRows.map(r => r.deliveryRound).filter(Boolean))].sort().reverse();
  sel.innerHTML = '<option value="">ทุกรอบจัดส่ง</option>' + rounds.map(d => {
    const n = allRows.filter(r => r.deliveryRound === d).length;
    return `<option value="${UI.esc(d)}">${UI.esc(Round.thai(d))}${d === today ? ' (รอบถัดไป)' : ''} · ${n}</option>`;
  }).join('');
  if (rounds.includes(keep)) sel.value = keep;
}

function filtered() {
  const q = $('#search').value.trim().toLowerCase();
  const round = $('#roundFilter').value;
  const rows = allRows.filter(r =>
    (!statusFilter || r.status === statusFilter) &&
    (!round || r.deliveryRound === round) &&
    (!q || [r.requestId, UI.fullName(r), r.studentId, r.phone, r.displayName].join(' ').toLowerCase().includes(q)));
  const by = $('#sortBy').value;
  const time = r => new Date(r.createdAt).getTime() || 0;
  return rows.sort((a, b) => {
    if (by === 'oldest') return time(a) - time(b);
    if (by === 'studentId') return String(a.studentId).localeCompare(String(b.studentId));
    if (by === 'round' && a.deliveryRound !== b.deliveryRound) return String(b.deliveryRound).localeCompare(String(a.deliveryRound));
    if (by === 'round') return time(a) - time(b);
    if (by === 'pickup' && a.pickupDate !== b.pickupDate) return String(a.pickupDate || '9999').localeCompare(String(b.pickupDate || '9999'));
    if (by === 'pickup') return time(a) - time(b);
    return time(b) - time(a);
  });
}

function render() {
  const counts = {};
  allRows.forEach(r => { counts[r.status] = (counts[r.status] || 0) + 1; });
  const stat = (key, label, n, cls) => `
    <button type="button" class="stat ${statusFilter === key ? 'active' : ''}" data-status="${UI.esc(key)}">
      <div class="num" ${cls != null ? `style="color:var(--s${cls})"` : ''}>${n}</div>
      <div class="lbl">${UI.esc(label)}</div>
    </button>`;
  $('#stats').innerHTML = stat('', 'ทั้งหมด', allRows.length, null) +
    CONFIG.STATUSES.map((s, i) => stat(s, s, counts[s] || 0, i)).join('');
  $('#stats').querySelectorAll('.stat').forEach(b => b.addEventListener('click', () => {
    statusFilter = b.dataset.status;
    render();
  }));

  // เลือกได้เฉพาะรายการที่ยังมีอยู่
  const ids = new Set(allRows.map(r => r.requestId));
  [...selected].forEach(id => { if (!ids.has(id)) selected.delete(id); });

  const rows = filtered();
  $('#emptyBox').hidden = rows.length > 0;
  const by = $('#sortBy').value;
  const key = by === 'pickup' ? 'pickupDate' : 'deliveryRound';
  const grouped = by === 'round' || by === 'pickup';
  const groupCount = {};
  rows.forEach(r => { groupCount[r[key]] = (groupCount[r[key]] || 0) + 1; });
  let last = null;
  $('#rows').innerHTML = rows.map((r, i) => {
    let head = '';
    if (grouped && r[key] !== last) {
      last = r[key];
      const label = by === 'pickup'
        ? '📅 นัดรับ ' + (r.pickupDate ? Round.thai(r.pickupDate, true) : 'ไม่ระบุ')
        : '🚚 รอบจัดส่ง ' + Round.thai(r.deliveryRound, true);
      head = `<tr class="group-row"><td colspan="9">${UI.esc(label)}
        <span class="muted small">(${groupCount[r[key]]} รายการ)</span>
        <button type="button" class="btn sm link" data-select-group="${UI.esc(r[key] || '')}">เลือกทั้งกลุ่ม</button></td></tr>`;
    }
    return head + `
    <tr data-id="${UI.esc(r.requestId)}">
      <td class="check"><input type="checkbox" data-check="${UI.esc(r.requestId)}" ${selected.has(r.requestId) ? 'checked' : ''} aria-label="เลือก ${UI.esc(r.requestId)}"></td>
      <td data-label="เลขที่"><span class="req-id">${UI.esc(r.requestId)}</span></td>
      <td data-label="ชื่อ">${UI.esc(UI.fullName(r))}</td>
      <td data-label="รหัสนักศึกษา">${UI.esc(r.studentId)}</td>
      <td data-label="โทร">${UI.esc(r.phone)}</td>
      <td data-label="รอบจัดส่ง">${UI.esc(Round.thai(r.deliveryRound))}</td>
      <td data-label="วันนัดรับ"><b>${UI.esc(r.pickupDate ? Round.thai(r.pickupDate) : '-')}</b></td>
      <td data-label="วันที่ยื่น">${UI.esc(UI.fmt(r.createdAt))}</td>
      <td>${UI.badge(r.status)}</td>
    </tr>`;
  }).join('');

  $('#rows').querySelectorAll('tr[data-id]').forEach(tr => tr.addEventListener('click', e => {
    if (e.target.closest('td.check')) return;
    openDetail(tr.dataset.id);
  }));
  $('#rows').querySelectorAll('input[data-check]').forEach(cb => cb.addEventListener('change', () => {
    if (cb.checked) selected.add(cb.dataset.check); else selected.delete(cb.dataset.check);
    renderBulk(rows);
  }));
  $('#rows').querySelectorAll('[data-select-group]').forEach(btn => btn.addEventListener('click', () => {
    rows.filter(r => (r[key] || '') === btn.dataset.selectGroup).forEach(r => selected.add(r.requestId));
    render();
  }));
  renderBulk(rows);
}

function renderBulk(rows) {
  $('#bulkBar').hidden = !selected.size;
  $('#bulkCount').textContent = selected.size;
  const all = $('#checkAll');
  const inView = rows.filter(r => selected.has(r.requestId)).length;
  all.checked = rows.length > 0 && inView === rows.length;
  all.indeterminate = inView > 0 && inView < rows.length;
}

async function onBulk(notify) {
  const ids = [...selected];
  const status = $('#bulkStatus').value;
  const note = $('#bulkNote').value.trim();
  const msg = `เปลี่ยน ${ids.length} คำร้องเป็น "${status}"` + (notify ? ' และส่งแจ้งเตือนทาง LINE' : ' (ไม่ส่ง LINE)') + ' ใช่ไหม';
  if (!confirm(msg)) return;
  const btns = [$('#bulkSaveBtn'), $('#bulkNotifyBtn')];
  btns.forEach(b => { b.disabled = true; });
  try {
    const updated = await adminCall('adminBulkUpdate', { requestIds: ids, status, note, notify });
    updated.forEach(u => {
      const i = allRows.findIndex(r => r.requestId === u.requestId);
      if (i >= 0) allRows[i] = u;
    });
    selected.clear();
    $('#bulkNote').value = '';
    render();
    UI.toast(`อัปเดต ${updated.length} คำร้องแล้ว` + (notify ? ' และแจ้ง LINE แล้ว' : ''), 'success');
  } catch (err) {
    UI.toast(err.message, 'error');
  } finally {
    btns.forEach(b => { b.disabled = false; });
  }
}

function openDetail(id) {
  current = allRows.find(r => r.requestId === id);
  if (!current) return;
  const r = current;
  $('#dlgTitle').textContent = r.requestId;
  $('#dlgBadge').innerHTML = UI.badge(r.status);
  $('#dlgInfo').innerHTML = `
    <dt>ชื่อ</dt><dd>${UI.esc(UI.fullName(r))}</dd>
    <dt>รหัส นศ.</dt><dd>${UI.esc(r.studentId)}</dd>
    <dt>โทรศัพท์</dt><dd><a href="tel:${UI.esc(r.phone)}">${UI.esc(r.phone)}</a></dd>
    <dt>รอบจัดส่ง</dt><dd>${UI.esc(Round.thai(r.deliveryRound, true))}</dd>
    <dt>วันนัดรับ</dt><dd><b>${UI.esc(r.pickupDate ? Round.thai(r.pickupDate, true) : '-')}</b></dd>
    <dt>LINE</dt><dd>${UI.esc(r.displayName || '-')}</dd>
    <dt>วันที่ยื่น</dt><dd>${UI.esc(UI.fmt(r.createdAt))}</dd>
    <dt>อัปเดต</dt><dd>${UI.esc(UI.fmt(r.updatedAt))}</dd>`;
  $('#dlgStatus').value = r.status;
  $('#dlgRound').value = r.deliveryRound || '';
  $('#dlgPickup').value = r.pickupDate || '';
  $('#dlgNote').value = '';
  $('#dlgHistory').innerHTML = UI.historyHtml(r.history);
  $('#dlg').showModal();
}

function formData() {
  return {
    requestId: current.requestId,
    status: $('#dlgStatus').value,
    note: $('#dlgNote').value.trim(),
    deliveryRound: $('#dlgRound').value,
    pickupDate: $('#dlgPickup').value,
  };
}

function hasChange(d) {
  return d.status !== current.status || d.note ||
    (d.deliveryRound && d.deliveryRound !== current.deliveryRound) ||
    (d.pickupDate && d.pickupDate !== (current.pickupDate || ''));
}

/** ปุ่ม "บันทึก": เก็บสถานะ/หมายเหตุ/รอบ โดยไม่ส่ง LINE */
async function onUpdate(e) {
  e.preventDefault();
  if (!current) return;
  const d = formData();
  if (!hasChange(d)) {
    UI.toast('กรุณาเปลี่ยนสถานะ รอบจัดส่ง วันนัดรับ หรือใส่หมายเหตุ', 'error');
    return;
  }
  await submitUpdate('adminUpdate', Object.assign(d, { notify: false }),
    $('#saveBtn'), id => `บันทึก ${id} แล้ว (ยังไม่ได้แจ้ง LINE)`);
}

/** ปุ่ม "แจ้งเตือน": ถ้ามีการเปลี่ยนให้บันทึกพร้อมแจ้ง ไม่งั้นส่งแจ้งสถานะปัจจุบันซ้ำ */
async function onNotify() {
  if (!current) return;
  const d = formData();
  const changed = hasChange(d);
  if (!changed && !confirm(`ส่งแจ้งเตือนสถานะ "${current.status}" ถึงผู้ยื่นอีกครั้งใช่ไหม`)) return;
  await submitUpdate(changed ? 'adminUpdate' : 'adminNotify', Object.assign(d, { notify: true }),
    $('#notifyBtn'), id => `แจ้งเตือน ${id} ทาง LINE แล้ว`);
}

async function submitUpdate(action, data, btn, doneMsg) {
  const label = btn.textContent;
  $('#saveBtn').disabled = $('#notifyBtn').disabled = true;
  btn.textContent = 'กำลังดำเนินการ...';
  try {
    const updated = await adminCall(action, data);
    const i = allRows.findIndex(r => r.requestId === updated.requestId);
    if (i >= 0) allRows[i] = updated;
    $('#dlg').close();
    fillRounds();
    render();
    UI.toast(doneMsg(updated.requestId), 'success');
  } catch (err) {
    UI.toast(err.message, 'error');
  } finally {
    $('#saveBtn').disabled = $('#notifyBtn').disabled = false;
    btn.textContent = label;
  }
}

// ===== วันหยุด =====
let holidayRows = [];

async function openHolidays() {
  $('#holRows').innerHTML = '<tr><td><div class="spinner"></div></td></tr>';
  $('#holDlg').showModal();
  try {
    holidayRows = await adminCall('adminHolidays');
    renderHolidays();
  } catch (err) {
    UI.toast(err.message, 'error');
  }
}

function renderHolidays() {
  const today = Round.today();
  const list = $('#holPast').checked ? holidayRows : holidayRows.filter(h => h.date >= today);
  $('#holRows').innerHTML = list.length ? list.map(h => `
    <tr>
      <td style="white-space:nowrap">${UI.esc(Round.thai(h.date, true))}</td>
      <td>${UI.esc(h.name)}</td>
      <td style="text-align:right"><button type="button" class="btn sm" data-del="${UI.esc(h.date)}">ลบ</button></td>
    </tr>`).join('') : '<tr><td class="muted">ยังไม่มีวันหยุด</td></tr>';
  $('#holRows').querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', async () => {
    if (!confirm('ลบวันหยุด ' + Round.thai(b.dataset.del, true) + ' ใช่ไหม')) return;
    b.disabled = true;
    try {
      holidayRows = await adminCall('adminDeleteHoliday', { date: b.dataset.del });
      renderHolidays();
    } catch (err) {
      UI.toast(err.message, 'error');
      b.disabled = false;
    }
  }));
}

async function addHoliday(e) {
  e.preventDefault();
  const date = $('#holDate').value;
  if (!date) return;
  const btn = $('#holForm').querySelector('button');
  btn.disabled = true;
  try {
    holidayRows = await adminCall('adminAddHoliday', { date, name: $('#holName').value.trim() });
    $('#holDate').value = '';
    $('#holName').value = '';
    renderHolidays();
    UI.toast('เพิ่มวันหยุดแล้ว', 'success');
  } catch (err) {
    UI.toast(err.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

function printList() {
  const round = $('#roundFilter').value;
  $('#printTitle').textContent = 'รายชื่อขอรับปริญญาบัตร ที่วังท่าพระ' +
    (round ? ' · รอบจัดส่ง ' + Round.thai(round, true) : '') +
    (statusFilter ? ' · สถานะ ' + statusFilter : '') + ` (${filtered().length} รายการ)`;
  window.print();
}

function exportCsv() {
  const rows = filtered();
  const head = ['เลขที่คำร้อง', 'วันที่ยื่น', 'คำนำหน้า', 'ชื่อ', 'นามสกุล', 'รหัสนักศึกษา', 'เบอร์โทร',
    'รอบจัดส่ง', 'วันนัดรับ', 'สถานะ', 'หมายเหตุ', 'อัปเดตล่าสุด', 'ชื่อ LINE'];
  const cell = v => {
    let s = String(v == null ? '' : v);
    if (/^[=+\-@]/.test(s)) s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
  };
  const lines = [head.map(cell).join(',')].concat(rows.map(r => [
    r.requestId, UI.fmt(r.createdAt), r.prefix, r.firstName, r.lastName, r.studentId, r.phone,
    Round.thai(r.deliveryRound), r.pickupDate ? Round.thai(r.pickupDate) : '', r.status, r.note, UI.fmt(r.updatedAt), r.displayName,
  ].map(cell).join(',')));
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `ขอรับปริญญาบัตร_วังท่าพระ_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

init();
