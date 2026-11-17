// ===== หน้าผู้ยื่นคำร้อง (เปิดผ่าน LIFF ใน LINE) =====
const $ = UI.$;
const OTHER = 'อื่น ๆ';
let idToken = null;
let myRows = [];

async function init() {
  UI.initTheme($('#themeBtn'));
  UI.demoBanner();
  fillOptions();
  bindEvents();
  showRound();
  setInterval(showRound, 60000);
  loadConfig();

  if (CONFIG.DEMO) {
    idToken = 'demo-user';
    showApp({ displayName: 'ผู้ทดลองใช้' });
    return;
  }
  try {
    await liff.init({ liffId: CONFIG.LIFF_ID });
    if (!liff.isLoggedIn()) {
      show('loginView');
      return;
    }
    idToken = liff.getIDToken();
    if (!idToken) {
      // เซสชันเก่ายังไม่มีสิทธิ์ openid → ล็อกอินใหม่เพื่อขอ ID token (ครั้งเดียวต่อนาที กันวนลูป)
      if (relogin()) return;
      UI.toast('ยืนยันตัวตน LINE ไม่สำเร็จ กรุณาปิดแล้วเปิดลิงก์ใหม่', 'error');
    }
    const profile = await liff.getProfile();
    showApp(profile);
  } catch (e) {
    show('loginView');
    UI.toast('เริ่มต้น LINE ไม่สำเร็จ: ' + e.message, 'error');
  }
}

function show(view) {
  ['loadingView', 'loginView', 'appView'].forEach(v => { $('#' + v).hidden = v !== view; });
}

function showRound() {
  $('#roundBox').textContent = '🚚 ถ้าส่งตอนนี้ จะจัดส่งรอบ ' + Round.thai(Round.of(new Date()), true);
  const min = Round.minPickup();
  const input = $('#pickupDate');
  input.min = min;
  input.max = Round.add(min, CONFIG.PICKUP_MAX_DAYS);
  $('#pickupHint').textContent = 'เลือกได้ตั้งแต่ ' + Round.thai(min, true) + ' เป็นต้นไป';
}

/** โหลดวันหยุดจากเซิร์ฟเวอร์ (ไม่ต้องล็อกอิน) แล้วคำนวณวันที่เลือกได้ใหม่ */
async function loadConfig() {
  try {
    const cfg = await Api.call('publicConfig');
    Round.setHolidays(cfg.holidays);
    showRound();
    const upcoming = cfg.holidays.filter(h => h.date >= Round.today());
    $('#holidayBox').hidden = !upcoming.length;
    $('#holidayList').innerHTML = upcoming.slice(0, 30).map(h =>
      `<li>${UI.esc(Round.thai(h.date, true))} — ${UI.esc(h.name)}</li>`).join('');
    if ($('#pickupDate').value) checkPickup();
  } catch (e) {
    UI.toast('โหลดรายการวันหยุดไม่สำเร็จ: ' + e.message, 'error');
  }
}

function checkPickup() {
  const el = $('#pickupDate');
  const msg = el.value ? Round.pickupError(el.value, Round.minPickup()) : '';
  if (msg) setError(el, msg); else clearError(el);
  return msg;
}

function showApp(profile) {
  $('#userBox').innerHTML =
    (profile.pictureUrl ? `<img src="${UI.esc(profile.pictureUrl)}" alt="">` : '') +
    `<span>${UI.esc(profile.displayName)}</span>`;
  show('appView');
  if (new URLSearchParams(location.search).get('tab') === 'mine') switchTab('mine');
  loadMine();
  setInterval(() => { if (!document.hidden) loadMine(true); }, CONFIG.REFRESH_SECONDS * 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) loadMine(true); });
}

async function callUser(action, data) {
  try {
    return await Api.call(action, Object.assign({ idToken }, data));
  } catch (e) {
    if ((e.code === 'TOKEN_EXPIRED' || e.code === 'AUTH') && !CONFIG.DEMO) {
      if (relogin()) e.message = 'กำลังเข้าสู่ระบบ LINE ใหม่...';
      else UI.toast('ยืนยันตัวตน LINE ไม่สำเร็จ กรุณาติดต่อผู้ดูแลระบบ', 'error');
    }
    throw e;
  }
}

/** ล็อกอิน LINE ใหม่ได้ครั้งเดียวต่อนาที กันวนลูปถ้าตั้งค่า channel ผิด — คืน true ถ้ากำลังพาไปล็อกอิน */
function relogin() {
  let last = 0;
  try { last = Number(sessionStorage.getItem('relogin_at')) || 0; } catch (err) { /* ignore */ }
  if (Date.now() - last < 60000) return false;
  try { sessionStorage.setItem('relogin_at', String(Date.now())); } catch (err) { /* ignore */ }
  liff.logout();
  liff.login({ redirectUri: location.href });
  return true;
}

function fillOptions() {
  $('#prefixList').innerHTML = CONFIG.PREFIXES.concat(OTHER).map(p =>
    `<label><input type="radio" name="prefix" value="${UI.esc(p)}"><span>${UI.esc(p)}</span></label>`).join('');
}

function bindEvents() {
  $('#loginBtn').addEventListener('click', () => liff.login({ redirectUri: location.href }));
  document.querySelectorAll('.tabs button').forEach(btn => btn.addEventListener('click', () => switchTab(btn.dataset.tab)));
  $('#prefixList').addEventListener('change', () => {
    const other = selectedPrefixRadio() === OTHER;
    $('#prefixOther').hidden = !other;
    if (other) $('#prefixOther').focus();
  });
  $('#studentId').addEventListener('input', e => { e.target.value = e.target.value.replace(/\D/g, ''); });
  $('#reqForm').addEventListener('submit', onSubmit);
  $('#reqForm').addEventListener('input', e => { if (e.target.id !== 'pickupDate') clearError(e.target); });
  $('#reqForm').addEventListener('change', e => { if (e.target.id !== 'pickupDate') clearError(e.target); });
  $('#pickupDate').addEventListener('change', checkPickup);
  $('#clearBtn').addEventListener('click', () => {
    if (confirm('ล้างคำตอบทั้งหมดในแบบฟอร์มใช่ไหม')) resetForm();
  });
}

function selectedPrefixRadio() {
  const el = document.querySelector('input[name="prefix"]:checked');
  return el ? el.value : '';
}

function resetForm() {
  $('#reqForm').reset();
  $('#prefixOther').hidden = true;
  document.querySelectorAll('.q-card.invalid').forEach(c => clearError(c));
}

function setError(el, msg) {
  const card = el.closest('.q-card');
  card.classList.add('invalid');
  let err = card.querySelector('.err');
  if (!err) {
    err = document.createElement('div');
    err.className = 'err';
    card.appendChild(err);
  }
  err.textContent = '⚠ ' + msg;
}

function clearError(el) {
  const card = el && el.closest && el.closest('.q-card');
  if (!card) return;
  card.classList.remove('invalid');
  const err = card.querySelector('.err');
  if (err) err.remove();
}

function switchTab(tab) {
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  $('#tab-form').hidden = tab !== 'form';
  $('#tab-mine').hidden = tab !== 'mine';
  if (tab === 'mine') loadMine(true);
}

async function onSubmit(e) {
  e.preventDefault();
  const radio = selectedPrefixRadio();
  const data = {
    prefix: radio === OTHER ? $('#prefixOther').value.trim() : radio,
    firstName: $('#firstName').value.trim(),
    lastName: $('#lastName').value.trim(),
    studentId: $('#studentId').value.trim(),
    phone: $('#phone').value.replace(/[\s-]/g, ''),
    pickupDate: $('#pickupDate').value,
  };
  const REQUIRED = 'นี่เป็นคำถามที่จำเป็น';
  const checks = [
    [$('#prefixList'), !radio ? REQUIRED : !data.prefix ? 'กรุณาระบุคำนำหน้า' : ''],
    [$('#firstName'), data.firstName && data.lastName ? '' : 'กรุณากรอกทั้งชื่อและนามสกุล'],
    [$('#studentId'), !data.studentId ? REQUIRED : !/^\d{8,12}$/.test(data.studentId) ? 'รหัสนักศึกษาต้องเป็นตัวเลข 8–12 หลัก' : ''],
    [$('#phone'), !data.phone ? REQUIRED : !/^0\d{8,9}$/.test(data.phone) ? 'กรุณากรอกเบอร์โทรศัพท์ 9–10 หลัก ขึ้นต้นด้วย 0' : ''],
    [$('#pickupDate'), !data.pickupDate ? 'กรุณาเลือกวันที่จะเข้าไปรับ' : Round.pickupError(data.pickupDate, Round.minPickup())],
    [$('#ack'), $('#ack').checked ? '' : 'กรุณาติ๊กรับทราบ'],
  ];
  let firstBad = null;
  checks.forEach(([el, msg]) => {
    if (msg) {
      setError(el, msg);
      firstBad = firstBad || el;
    } else {
      clearError(el);
    }
  });
  if (firstBad) {
    firstBad.closest('.q-card').scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }

  const btn = $('#submitBtn');
  btn.disabled = true;
  btn.textContent = 'กำลังส่งคำร้อง...';
  try {
    const res = await callUser('submit', data);
    resetForm();
    const box = $('#successBox');
    box.innerHTML = `✅ ส่งคำร้องเรียบร้อยแล้ว<br>เลขที่คำร้อง <b>${UI.esc(res.requestId)}</b> · ` +
      `จัดส่งรอบ <b>${UI.esc(Round.thai(res.deliveryRound, true))}</b><br>` +
      `วันที่นัดรับ <b>${UI.esc(Round.thai(res.pickupDate, true))}</b> · ระบบจะแจ้งเตือนสถานะทาง LINE`;
    box.hidden = false;
    window.scrollTo({ top: 0, behavior: 'smooth' });
    await loadMine(true);
  } catch (err) {
    UI.toast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'ส่ง';
  }
}

async function loadMine(silent) {
  const list = $('#mineList');
  if (!silent && !myRows.length) list.innerHTML = '<div class="spinner"></div>';
  try {
    const rows = await callUser('myRequests');
    if (silent && JSON.stringify(rows) === JSON.stringify(myRows)) return;
    myRows = rows;
    renderMine();
  } catch (err) {
    if (!silent) list.innerHTML = `<div class="empty">${UI.esc(err.message)}</div>`;
  }
}

function renderMine() {
  const count = $('#mineCount');
  count.hidden = !myRows.length;
  count.textContent = myRows.length;

  const list = $('#mineList');
  if (!myRows.length) {
    list.innerHTML = '<div class="card empty">ยังไม่มีคำร้อง</div>';
    return;
  }
  const openIds = [...list.querySelectorAll('details[open]')].map(d => d.dataset.id);
  const flow = CONFIG.STATUSES.filter(s => s !== 'ไม่อนุมัติ');
  list.innerHTML = myRows.map(r => {
    const rejected = r.status === 'ไม่อนุมัติ';
    const idx = flow.indexOf(r.status);
    const steps = rejected ? '' : `<div class="steps">${flow.map((s, i) =>
      `<div class="step ${i <= idx ? 'done' : ''} ${i === idx ? 'current' : ''}">${UI.esc(s)}</div>`).join('')}</div>`;
    return `
      <article class="card req-card">
        <div class="head">
          <div>
            <div class="req-id">${UI.esc(r.requestId)}</div>
            <div class="muted small">ยื่นเมื่อ ${UI.esc(UI.fmt(r.createdAt))}</div>
          </div>
          ${UI.badge(r.status)}
        </div>
        ${steps}
        <div style="margin-top:8px">${UI.esc(UI.fullName(r))} · ${UI.esc(r.studentId)}</div>
        <div class="muted small">รอบจัดส่ง: ${UI.esc(Round.thai(r.deliveryRound, true))}</div>
        ${r.pickupDate ? `<div class="small"><b>วันที่นัดรับ: ${UI.esc(Round.thai(r.pickupDate, true))}</b></div>` : ''}
        ${r.status === 'พร้อมรับที่วังท่าพระ' ? `<div class="note-box">🎉 รับได้ที่กองบริหารงานวิชาการ วังท่าพระ ในวันและเวลาราชการ — อย่าลืมนำสำเนาบัตรประชาชนมาด้วย</div>` : ''}
        ${r.note ? `<div class="note-box">หมายเหตุจากเจ้าหน้าที่: ${UI.esc(r.note)}</div>` : ''}
        <details data-id="${UI.esc(r.requestId)}">
          <summary>ประวัติสถานะ</summary>
          ${UI.historyHtml(r.history)}
        </details>
      </article>`;
  }).join('');
  list.querySelectorAll('details').forEach(d => { if (openIds.includes(d.dataset.id)) d.open = true; });
}

init();
