/**
 * GIA PHẢ - MÁY CHỦ TRÊN GOOGLE APPS SCRIPT
 * Chạy bằng tài khoản Google của quản trị viên; toàn bộ dữ liệu nằm trong Drive của tài khoản này.
 * Cách dùng: script.google.com > Dự án mới > dán toàn bộ tệp này > điền CLIENT_ID bên dưới >
 * Triển khai > Tùy chọn triển khai mới > Ứng dụng web > Thực thi với tư cách: Tôi; Quyền truy cập: Bất kỳ ai
 * > Triển khai > cấp quyền > sao chép URL (kết thúc bằng /exec) dán vào ứng dụng.
 * Mọi quyền được kiểm tra tại đây: người lạ không đọc hay ghi được dù biết địa chỉ.
 */
const CLIENT_ID = 'DÁN_CLIENT_ID_VÀO_ĐÂY.apps.googleusercontent.com';
const FILE = 'giapha-data.json', FOLDER = 'giapha-anh';
const FIELDS = ['name', 'hu', 'tu', 'th', 'bd', 'src', 'cf', 'g', 'b', 'bp', 'pl', 'chi', 'd', 'gd', 'gm', 'bur', 'dead', 'rs', 'tel', 'mail', 'ct', 'job', 'edu', 'wp', 'fid', 'mid', 'sid', 'xs', 'note', 'ph'];

// Làm sạch nội dung do thành viên gửi lên: chỉ nhận các trường đã biết, giới hạn độ dài, bỏ quan hệ trỏ tới người không tồn tại
const MAXLEN = { xs: 300, src: 500, hu: 100, tu: 100, th: 100, bd: 200, cf: 2, note: 2000, bur: 300, pl: 300, bp: 300, rs: 300, ct: 300, wp: 300, job: 200, edu: 200, mail: 200, chi: 100 };
const PID_RE = /^[A-Za-z0-9_-]{3,24}$/;
function clean_(person, db, pid) {
  const o = {};
  FIELDS.forEach(k => {
    if (k == 'ph' || person[k] === undefined || person[k] === null) return;
    o[k] = String(person[k]).slice(0, MAXLEN[k] || 100);
  });
  if (o.g && o.g != 'm' && o.g != 'f') o.g = 'm';
  if (o.cf && o.cf != 'kc' && o.cf != 'nv') o.cf = '';
  ['fid', 'mid', 'sid'].forEach(k => { if (o[k] && (o[k] == pid || !db.people[o[k]])) o[k] = ''; });
  if (o.xs) o.xs = o.xs.split(',').map(x => x.trim()).filter((x, i, a) => x && x != pid && db.people[x] && a.indexOf(x) == i).slice(0, 10).join(',');
  return o;
}
const MAX_PENDING = 30;

// Thông tin liên hệ: chỉ quản trị viên và người được cấp quyền mới nhận được (máy chủ cắt bỏ trước khi gửi đi)
const CONTACT = ['rs', 'tel', 'mail', 'ct', 'wp'];
function strip_(db) {
  const o = { people: {}, updated: db.updated };
  for (const k in db.people) { const p = Object.assign({}, db.people[k]); CONTACT.forEach(f => delete p[f]); o.people[k] = p; }
  return o;
}

// ---- Thông báo email (chỉ gửi tên người, loại thay đổi, tên trường; không gửi nội dung như số điện thoại) ----
const LBL = { name: 'Họ tên', hu: 'Tên húy', tu: 'Tên tự', th: 'Tên thụy, hiệu', bd: 'Tên gọi khác', src: 'Nguồn', cf: 'Độ tin cậy', g: 'Giới tính', b: 'Ngày sinh', bp: 'Nơi sinh', pl: 'Quê quán', chi: 'Chi, phái', d: 'Ngày mất', gd: 'Giỗ (ngày)', gm: 'Giỗ (tháng)', bur: 'Nơi an táng', dead: 'Đã mất', rs: 'Nơi ở hiện tại', tel: 'Điện thoại', mail: 'Email', ct: 'Liên hệ khác', job: 'Nghề nghiệp', edu: 'Học vấn', wp: 'Nơi làm việc', fid: 'Cha', mid: 'Mẹ', sid: 'Vợ/chồng', xs: 'Vợ/chồng khác', note: 'Ghi chú', fl: 'Tài liệu' };
const OPV = { add: 'thêm người', edit: 'sửa thông tin', del: 'xoá người' };
function nt_(d) { return Object.assign({ admin: true, member: true, url: '' }, d.notify || {}); }
function mail_(to, subject, body) {
  try {
    if (!to || MailApp.getRemainingDailyQuota() < 1) return;
    MailApp.sendEmail(to, String(subject).replace(/[\r\n]+/g, ' ').slice(0, 150), body);
  } catch (e) { /* lỗi gửi thư không được làm hỏng thao tác chính */ }
}
function link_(n) { return n.url ? '\n\nMở ứng dụng: ' + n.url : ''; }

// ---- Nhật ký sửa đổi: chỉ ghi tên trường đã đổi, không ghi nội dung (tránh lộ số điện thoại, địa chỉ) ----
function changed_(a, b) { return FIELDS.filter(k => String(a[k] || '') != String(b[k] || '')); }
function albumIds_(p) { return (p.al || []).map(x => x.id).join(','); }
function flIds_(p) { return (p.fl || []).map(x => x.id).join(','); }
function diff_(a, b) {
  const A = (a && a.people) || {}, B = (b && b.people) || {}, out = [];
  for (const k in B) {
    if (!A[k]) out.push({ act: 'them', n: B[k].name });
    else { const f = changed_(A[k], B[k]); if (albumIds_(A[k]) != albumIds_(B[k])) f.push('al'); if (flIds_(A[k]) != flIds_(B[k])) f.push('fl'); if (f.length) out.push({ act: 'sua', n: B[k].name, f: f }); }
  }
  for (const k in A) if (!B[k]) out.push({ act: 'xoa', n: A[k].name });
  return out;
}
function log_(d, arr) { d.log = (d.log || []).concat(arr).slice(-500); }

// ---- Âm lịch (thuật toán Hồ Ngọc Đức, múi giờ +7), dùng để nhắc giỗ và sinh nhật ----
const TZ = 7, INT = Math.floor;
function jd(d, m, y) { const a = INT((14 - m) / 12), Y = y + 4800 - a, M = m + 12 * a - 3; return d + INT((153 * M + 2) / 5) + 365 * Y + INT(Y / 4) - INT(Y / 100) + INT(Y / 400) - 32045; }
function jdd(j) { const a = j + 32044, b = INT((4 * a + 3) / 146097), c = a - INT(b * 146097 / 4), d = INT((4 * c + 3) / 1461), e = c - INT(1461 * d / 4), m = INT((5 * e + 2) / 153); return [e - INT((153 * m + 2) / 5) + 1, m + 3 - 12 * INT(m / 10), b * 100 + d - 4800 + INT(m / 10)]; }
function nm(k) {
  const T = k / 1236.85, T2 = T * T, T3 = T2 * T, r = Math.PI / 180, S = x => Math.sin(x * r);
  const J = 2415020.75933 + 29.53058868 * k + 0.0001178 * T2 - 0.000000155 * T3 + 0.00033 * S(166.56 + 132.87 * T - 0.009173 * T2);
  const M = 359.2242 + 29.10535608 * k - 0.0000333 * T2 - 0.00000347 * T3, Mp = 306.0253 + 385.81691806 * k + 0.0107306 * T2 + 0.00001236 * T3, F = 21.2964 + 390.67050646 * k - 0.0016528 * T2 - 0.00000239 * T3;
  const C = (0.1734 - 0.000393 * T) * S(M) + 0.0021 * S(2 * M) - 0.4068 * S(Mp) + 0.0161 * S(2 * Mp) - 0.0004 * S(3 * Mp) + 0.0104 * S(2 * F) - 0.0051 * S(M + Mp) - 0.0074 * S(M - Mp) + 0.0004 * S(2 * F + M) - 0.0004 * S(2 * F - M) - 0.0006 * S(2 * F + Mp) + 0.001 * S(2 * F - Mp) + 0.0005 * S(2 * Mp + M);
  const dt = T < -11 ? 0.001 + 0.000839 * T + 0.0002261 * T2 - 0.00000845 * T3 - 0.000000081 * T * T3 : -0.000278 + 0.000265 * T + 0.000262 * T2;
  return INT(J + C - dt + .5 + TZ / 24);
}
function sl(j) {
  const T = (j - 2451545.5 - TZ / 24) / 36525, T2 = T * T, r = Math.PI / 180, M = 357.5291 + 35999.0503 * T - 0.0001559 * T2 - 0.00000048 * T * T2, L0 = 280.46645 + 36000.76983 * T + 0.0003032 * T2;
  const DL = (1.9146 - 0.004817 * T - 0.000014 * T2) * Math.sin(r * M) + (0.019993 - 0.000101 * T) * Math.sin(r * 2 * M) + 0.00029 * Math.sin(r * 3 * M);
  let L = (L0 + DL) * r; L -= Math.PI * 2 * INT(L / (Math.PI * 2)); return INT(L / Math.PI * 6);
}
function m11(y) { const k = INT((jd(31, 12, y) - 2415021) / 29.530588853); let n = nm(k); if (sl(n) >= 9) n = nm(k - 1); return n; }
function leapOff(a) { const k = INT((a - 2415021.076998695) / 29.530588853 + .5); let last, i = 1, arc = sl(nm(k + i)); do { last = arc; i++; arc = sl(nm(k + i)); } while (arc != last && i < 14); return i - 1; }
function s2l(d, m, y) {
  const dn = jd(d, m, y), k = INT((dn - 2415021.076998695) / 29.530588853); let ms = nm(k + 1); if (ms > dn) ms = nm(k);
  let a = m11(y), b = a, ly; if (a >= ms) { ly = y; a = m11(y - 1); } else { ly = y + 1; b = m11(y + 1); }
  const df = INT((ms - a) / 29); let lm = df + 11, lp = 0;
  if (b - a > 365) { const lo = leapOff(a); if (df >= lo) { lm = df + 10; if (df == lo) lp = 1; } }
  if (lm > 12) lm -= 12; if (lm >= 11 && df < 4) ly--; return [dn - ms + 1, lm, ly, lp];
}
function pd_(s) { return /^\d{4}-\d\d-\d\d$/.test(s || '') ? [+s.slice(8), +s.slice(5, 7), +s.slice(0, 4)] : null; }
function gioDM_(p) { if (p.gd && p.gm) return [+p.gd, +p.gm]; const x = pd_(p.d); if (!x) return null; const l = s2l(x[0], x[1], x[2]); return [l[0], l[1]]; }
// ngày dương lịch cho ngày lunar (d, m) có phải là ngày giỗ g không (giỗ ngày 30 lùi về ngày 29 nếu tháng thiếu)
function gioHit_(g, s) {
  const l = s2l(s[0], s[1], s[2]); if (l[3] || l[1] != g[1]) return false;
  if (l[0] == g[0]) return true;
  if (g[0] == 30 && l[0] == 29) { const n = jdd(jd(s[0], s[1], s[2]) + 1), ln = s2l(n[0], n[1], n[2]); return ln[0] == 1; }
  return false;
}
function leap_(y) { return new Date(Date.UTC(y, 2, 0)).getUTCDate() == 29; }
function isDead_(p) { return !!(p.dead || p.d); }

// ---- Sao lưu tự động trên Drive: mỗi ngày một bản (khi có thay đổi hoặc khi chạy nhắc việc), giữ 30 bản gần nhất ----
const BKFOLDER = 'giapha-saoluu', BKKEEP = 30;
function bkFolder_() { const it = DriveApp.getFoldersByName(BKFOLDER); return it.hasNext() ? it.next() : DriveApp.createFolder(BKFOLDER); }
function backup_(d, why) {
  try {
    const now = Date.now();
    if (!why && d.lastBk && now - d.lastBk < 20 * 3600000) return false;
    const f = bkFolder_(), stamp = new Date(now + 7 * 3600000).toISOString().replace(/[-:T]/g, '').slice(0, 14);
    f.createFile('giapha-' + stamp + (why ? '-' + why : '') + '.json', JSON.stringify({ at: now, rev: d.rev, n: Object.keys(d.db.people).length, db: d.db }), 'application/json');
    d.lastBk = now;
    const all = []; const it = f.getFiles(); while (it.hasNext()) { const x = it.next(); all.push({ f: x, n: x.getName() }); }
    all.sort((a, b) => a.n < b.n ? 1 : -1); all.slice(BKKEEP).forEach(x => x.f.setTrashed(true));
    return true;
  } catch (e) { return false; }
}
function bkList_() {
  const out = [], it = bkFolder_().getFiles();
  while (it.hasNext()) { const x = it.next(); out.push({ id: x.getId(), name: x.getName(), size: x.getSize() }); }
  return out.sort((a, b) => a.name < b.name ? 1 : -1);
}

// ---- Email nhắc giỗ và sinh nhật: chạy hằng ngày lúc 7 giờ sau khi quản trị viên chạy hàm setupReminders một lần ----
function rm_(d) { return Object.assign({ on: false, lead: 3, who: 'admin' }, d.remind || {}); }
function remindLines_(d, T, off, label) {
  const s = jdd(jd(T[0], T[1], T[2]) + off), out = [], P = d.db.people;
  const dt = s[0] + '/' + s[1] + '/' + s[2], l = s2l(s[0], s[1], s[2]), lt = l[0] + '/' + l[1] + (l[3] ? ' nhuận' : '');
  for (const k in P) {
    const p = P[k], b = pd_(p.b);
    if (b && !isDead_(p) && ((b[0] == s[0] && b[1] == s[1]) || (b[0] == 29 && b[1] == 2 && s[0] == 28 && s[1] == 2 && !leap_(s[2])))) out.push('- Sinh nhật ' + p.name + ' (tròn ' + (s[2] - b[2]) + ' tuổi)');
    const g = gioDM_(p);
    if (g && gioHit_(g, s)) { const y = +String(p.d || '').slice(0, 4); out.push('- Giỗ ' + p.name + (y ? ' (' + (s[2] - y) + ' năm)' : '')); }
  }
  return out.length ? [label + ': ' + dt + ' dương lịch, ' + lt + ' âm lịch'].concat(out) : [];
}
function daily_(nowMs, force) {
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const d = read_(), R = rm_(d), n = typeof nowMs == 'number' ? nowMs : Date.now();
    let sent = 0;
    if (R.on) {
      const t = new Date(n + 7 * 3600000), T = [t.getUTCDate(), t.getUTCMonth() + 1, t.getUTCFullYear()], key = T[2] + '-' + T[1] + '-' + T[0];
      if (d.lastRemind != key || force) {
        const lines = remindLines_(d, T, 0, 'Hôm nay').concat(R.lead > 0 ? remindLines_(d, T, R.lead, 'Sau ' + R.lead + ' ngày') : []);
        d.lastRemind = key;
        if (lines.length) {
          const to = [owner_()];
          if (R.who == 'all') Object.keys(d.members || {}).forEach(e => { if (!(d.remindOff && d.remindOff[e])) to.push(e); });
          if (d.remindOff && d.remindOff[owner_()]) to.shift();
          const body = lines.join('\n') + link_(nt_(d)) + '\n\nBạn có thể tắt email nhắc trong tab Cài đặt của ứng dụng.';
          to.forEach(e => { mail_(e, 'Gia phả: nhắc giỗ, sinh nhật', body); sent++; });
        }
      }
    }
    backup_(d);
    write_(d);
    return sent;
  } finally { lock.releaseLock(); }
}
function setupReminders() {
  ScriptApp.getProjectTriggers().forEach(t => { if (t.getHandlerFunction() == 'daily_') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('daily_').timeBased().everyDays(1).atHour(7).create();
}

// ---- Liên kết chia sẻ một nhánh (xem không cần đăng nhập): chỉ trả tên, giới tính, năm sinh/mất và quan hệ, không có liên hệ, ghi chú, ảnh ----
const FILE_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/wav', 'video/mp4', 'text/plain'];
const FILE_FOLDER = 'giapha-tailieu', MAX_FILE = 8 * 1024 * 1024, ID_RE = /^[A-Za-z0-9_-]{4,40}$/;
function fileFolder_() { const it = DriveApp.getFoldersByName(FILE_FOLDER); return it.hasNext() ? it.next() : DriveApp.createFolder(FILE_FOLDER); }
function shareList_(d) { return Object.keys(d.shares || {}).map(k => Object.assign({ token: k }, d.shares[k])).sort((a, b) => b.at - a.at); }
function shared_(q) {
  const d = read_(), tk = String(q.token || ''), sh = /^[A-Za-z0-9]{8,64}$/.test(tk) && d.shares && d.shares[tk];
  if (!sh || !d.db.people[sh.root]) return { err: 'Liên kết không còn hiệu lực' };
  const P = d.db.people, set = {}, kidsOf = id => Object.keys(P).filter(k => P[k].fid == id || P[k].mid == id);
  set[sh.root] = 1;
  let fr = [sh.root];
  for (let g = 1; fr.length && (!sh.depth || g < sh.depth); g++) {
    const nx = [];
    fr.forEach(id => {
      const sp = spouses_(P[id]).filter(s => P[s]);
      sp.forEach(s => { set[s] = 1; });
      kidsOf(id).concat.apply([], sp.map(s => kidsOf(s).filter(k => { const o = P[k].fid == s ? P[k].mid : P[k].fid; return !o || o == id; }))).forEach(k => { if (!set[k]) { set[k] = 1; nx.push(k); } });
    });
    fr = nx;
  }
  Object.keys(set).forEach(id => spouses_(P[id]).forEach(s => { if (P[s]) set[s] = 1; }));
  const out = {};
  Object.keys(set).forEach(id => {
    const p = P[id], dead = isDead_(p), keep = x => (x && set[x] && x != id) ? x : '';
    out[id] = { id: id, name: p.name, g: p.g, dead: dead ? '1' : '', b: dead ? (p.b || '') : String(p.b || '').slice(0, 4), d: p.d || '', chi: p.chi || '', fid: keep(p.fid), mid: keep(p.mid), sid: keep(p.sid), xs: String(p.xs || '').split(',').filter(x => keep(x)).join(',') };
  });
  out[sh.root].fid = ''; out[sh.root].mid = '';
  return { name: P[sh.root].name, depth: sh.depth || 0, people: out };
}

function owner_() { return Session.getEffectiveUser().getEmail().toLowerCase(); }
function file_() {
  const it = DriveApp.getFilesByName(FILE);
  return it.hasNext() ? it.next() : DriveApp.createFile(FILE, JSON.stringify({ rev: 1, db: { people: {}, updated: 0 }, members: {}, queue: [] }), 'application/json');
}
function folder_() { const it = DriveApp.getFoldersByName(FOLDER); return it.hasNext() ? it.next() : DriveApp.createFolder(FOLDER); }
function read_() { return JSON.parse(file_().getBlob().getDataAsString()); }
function write_(d) { file_().setContent(JSON.stringify(d)); }
function out_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

// Xác thực mã đăng nhập Google (ID token) do trình duyệt gửi lên
function who_(t) {
  if (!t) return null;
  const r = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(t), { muteHttpExceptions: true });
  if (r.getResponseCode() != 200) return null;
  const j = JSON.parse(r.getContentText());
  return j.aud == CLIENT_ID && String(j.email_verified) == 'true' ? String(j.email).toLowerCase() : null;
}

function doGet() { return out_({ ok: true, msg: 'Gia pha server' }); }

function doPost(e) {
  let q;
  try { q = JSON.parse(e.postData.contents); } catch (x) { return out_({ err: 'Dữ liệu gửi lên không hợp lệ' }); }
  if (q && q.a == 'shared') return out_(shared_(q));
  const me = who_(q.t);
  if (!me) return out_({ err: 'auth' });
  const lock = LockService.getScriptLock();
  let got = false;
  try { lock.waitLock(20000); got = true; return out_(run_(q, me)); }
  catch (x) { return out_({ err: got ? String(x) : 'Máy chủ đang bận, hãy thử lại sau ít giây' }); }
  finally { if (got) lock.releaseLock(); }
}

function spouses_(p) { return [p.sid].concat(String(p.xs || '').split(',')).map(i => String(i || '').trim()).filter((i, k, a) => i && a.indexOf(i) == k); }
function apply_(db, x) {
  const P = db.people;
  if (x.op == 'del') {
    delete P[x.pid];
    for (const k in P) { for (const f of ['fid', 'mid', 'sid']) if (P[k][f] == x.pid) P[k][f] = ''; if (P[k].xs) P[k].xs = P[k].xs.split(',').filter(i => i && i != x.pid).join(','); }
  } else {
    P[x.pid] = Object.assign({}, P[x.pid] || {}, x.person, { id: x.pid }); // giữ nguyên ảnh và album đã có
    ['fid', 'mid', 'sid'].forEach(f => { const r = P[x.pid][f]; if (r && (r == x.pid || !P[r])) P[x.pid][f] = ''; }); // người được trỏ tới có thể đã bị xoá từ lúc gửi đề xuất
    const mine = spouses_(P[x.pid]).filter(i => P[i]);
    P[x.pid].xs = (P[x.pid].xs || '').split(',').filter(i => i && P[i] && i != x.pid).join(',');
    for (const k in P) { // người này là bản gốc: bỏ liên kết cũ không còn, thêm liên kết hai chiều mới
      if (k == x.pid) continue;
      const q = P[k], has = spouses_(q).indexOf(x.pid) >= 0;
      if (has && mine.indexOf(k) < 0) { if (q.sid == x.pid) q.sid = ''; q.xs = (q.xs || '').split(',').filter(i => i && i != x.pid).join(','); }
      if (!has && mine.indexOf(k) >= 0) { if (!q.sid) q.sid = x.pid; else q.xs = (q.xs ? q.xs + ',' : '') + x.pid; }
    }
  }
  db.updated = Date.now();
}

function run_(q, me) {
  const d = read_(), role = me == owner_() ? 'quan-tri' : d.members[me];
  d.log = d.log || [];
  if (!role) return { err: 'denied' };
  const admin = role == 'quan-tri', A = q.a;
  const contact = admin || !!(d.contact && d.contact[me]);

  if (A == 'load') return { role: role, me: me, rev: d.rev, db: contact ? d.db : strip_(d.db), queue: admin ? d.queue : d.queue.filter(x => x.by == me), members: admin ? d.members : undefined, contact: admin ? (d.contact || {}) : undefined, vis: d.vis || {}, defaults: admin ? (d.defaults || { role: 'de-xuat', contact: false, export: false }) : undefined, notify: admin ? nt_(d) : undefined, remind: admin ? rm_(d) : undefined, shares: admin ? shareList_(d) : undefined, remindMe: !(d.remindOff && d.remindOff[me]), owner: me == owner_(), exports: admin ? (d.exports || {}) : undefined, perm: { propose: role != 'xem', contact: contact, export: admin || !!(d.exports && d.exports[me]) } };

  if (A == 'getImg') {
    const it = folder_().getFilesByName(q.id + '.jpg');
    return it.hasNext() ? { data: Utilities.base64Encode(it.next().getBlob().getBytes()) } : { err: 'Không thấy ảnh' };
  }

  if (A == 'getFile') {
    if (!ID_RE.test(String(q.id || ''))) return { err: 'Tệp không hợp lệ' };
    const it = fileFolder_().getFilesByName(String(q.id));
    if (!it.hasNext()) return { err: 'Không thấy tệp' };
    const b = it.next().getBlob();
    return { data: Utilities.base64Encode(b.getBytes()), mime: b.getContentType() };
  }

  if (A == 'propose') {
    if (role != 'de-xuat' && !admin) return { err: 'denied' };
    if (['add', 'edit', 'del'].indexOf(q.op) < 0 || !q.pid || String(q.pid).length > 64 || (q.op == 'add' && !PID_RE.test(String(q.pid)))) return { err: 'Đề xuất không hợp lệ' };
    if (!admin && d.queue.filter(x => x.by == me && x.status == 'cho').length >= MAX_PENDING) return { err: 'Bạn đang có quá nhiều đề xuất chờ duyệt (tối đa ' + MAX_PENDING + '). Hãy đợi quản trị viên xử lý bớt.' };
    if (q.op == 'add' && d.db.people[q.pid]) return { err: 'Mã người đã tồn tại' };
    if (q.op != 'add' && !d.db.people[q.pid]) return { err: 'Người này không còn trong gia phả' };
    const person = q.op == 'del' ? null : clean_(q.person || {}, d.db, q.pid);
    if (person) { if (!String(person.name || '').trim()) return { err: 'Thiếu họ tên' }; if (!contact) CONTACT.forEach(k => delete person[k]); }
    d.queue.push({ id: Utilities.getUuid().slice(0, 8), op: q.op, pid: q.pid, person: person, name: String(q.name || (person && person.name) || '').slice(0, 100), by: me, at: Date.now(), status: 'cho', note: String(q.note || '').slice(0, 300) });
    d.queue = d.queue.slice(-300);
    log_(d, [{ at: Date.now(), by: me, act: 'dexuat', op: q.op, n: q.name || (person && person.name) || '' }]);
    write_(d);
    const n = nt_(d);
    if (n.admin && !admin) {
      const old = d.db.people[q.pid], f = q.op == 'edit' && old && person ? changed_(old, person).filter(k => k != 'ph').map(k => LBL[k] || k) : [];
      mail_(owner_(), 'Gia phả: đề xuất mới từ ' + me,
        me + ' vừa gửi đề xuất ' + OPV[q.op] + ': "' + (q.name || (person && person.name) || '') + '".' + (f.length ? '\nTrường thay đổi: ' + f.join(', ') : '') + (q.note ? '\nGhi chú: ' + String(q.note).slice(0, 300) : '') + '\n\nHãy vào tab Duyệt để kiểm tra và xác nhận.' + link_(n));
    }
    return { queue: d.queue.filter(x => x.by == me) };
  }

  if (A == 'cancel') {
    const x = d.queue.filter(z => z.id == q.id && z.by == me && z.status == 'cho')[0];
    if (!x) return { err: 'Đề xuất không còn chờ duyệt' };
    x.status = 'thuhoi';
    log_(d, [{ at: Date.now(), by: me, act: 'thuhoi', op: x.op, n: x.name || (x.person && x.person.name) || '' }]);
    write_(d);
    return { queue: d.queue.filter(z => z.by == me) };
  }

  if (A == 'remindme') {
    d.remindOff = d.remindOff || {};
    if (q.off) d.remindOff[me] = true; else delete d.remindOff[me];
    write_(d);
    return { remindMe: !d.remindOff[me] };
  }

  if (!admin) return { err: 'denied' };

  if (A == 'log') return { log: d.log.slice(-300) };
  if (A == 'notify') {
    const u = String(q.url || '').trim();
    d.notify = { admin: !!q.admin, member: !!q.member, url: /^https:\/\/[^\s<>"']+$/.test(u) ? u.slice(0, 300) : '' };
    write_(d);
    return { notify: d.notify };
  }

  if (A == 'remind') {
    d.remind = { on: !!q.on, lead: [0, 1, 3, 7].indexOf(+q.lead) >= 0 ? +q.lead : 3, who: q.who == 'all' ? 'all' : 'admin' };
    write_(d);
    return { remind: d.remind };
  }
  if (A == 'putFile') {
    if (!ID_RE.test(String(q.id || '')) || FILE_TYPES.indexOf(q.mime) < 0) return { err: 'Định dạng tệp chưa được hỗ trợ' };
    const data = String(q.data || '');
    if (!data || data.length * 3 / 4 > MAX_FILE) return { err: 'Tệp quá lớn (tối đa 8 MB)' };
    const f = fileFolder_(), it = f.getFilesByName(String(q.id));
    while (it.hasNext()) it.next().setTrashed(true);
    f.createFile(Utilities.newBlob(Utilities.base64Decode(data), q.mime, String(q.id)));
    return { ok: 1 };
  }
  if (A == 'delFile') {
    if (!ID_RE.test(String(q.id || ''))) return { err: 'Tệp không hợp lệ' };
    const it = fileFolder_().getFilesByName(String(q.id));
    while (it.hasNext()) it.next().setTrashed(true);
    return { ok: 1 };
  }
  if (A == 'shareNew') {
    const root = String(q.root || ''), P = d.db.people;
    if (!P[root]) return { err: 'Không thấy người gốc' };
    d.shares = d.shares || {};
    if (Object.keys(d.shares).length >= 20) return { err: 'Đã có 20 liên kết, hãy thu hồi bớt trước khi tạo thêm' };
    const depth = Math.max(0, Math.min(8, parseInt(q.depth) || 0)), tk = (Utilities.getUuid() + Utilities.getUuid()).replace(/[^A-Za-z0-9]/g, '').slice(0, 40);
    d.shares[tk] = { root: root, depth: depth, name: P[root].name, at: Date.now(), by: me };
    log_(d, [{ at: Date.now(), by: me, act: 'nhieu', n: 'Tạo liên kết chia sẻ nhánh ' + P[root].name }]);
    write_(d);
    return { shares: shareList_(d), token: tk };
  }
  if (A == 'shareDel') {
    if (d.shares && d.shares[String(q.token)]) { const nm = d.shares[String(q.token)].name; delete d.shares[String(q.token)]; log_(d, [{ at: Date.now(), by: me, act: 'nhieu', n: 'Thu hồi liên kết chia sẻ nhánh ' + nm }]); write_(d); }
    return { shares: shareList_(d) };
  }
  if (A == 'bklist') return { list: bkList_() };
  if (A == 'bknow') { backup_(d, 'thucong'); write_(d); return { list: bkList_() }; }
  if (A == 'bkrestore') {
    if (me != owner_()) return { err: 'Chỉ tài khoản chủ mới được khôi phục bản sao lưu' };
    let bk;
    try { bk = JSON.parse(DriveApp.getFileById(String(q.id)).getBlob().getDataAsString()); } catch (e) { return { err: 'Không đọc được bản sao lưu' }; }
    if (!bk || !bk.db || !bk.db.people) return { err: 'Bản sao lưu không hợp lệ' };
    backup_(d, 'truoc-khoi-phuc');
    d.db = bk.db; d.db.updated = Date.now(); d.rev++;
    log_(d, [{ at: Date.now(), by: me, act: 'nhieu', n: 'Khôi phục bản sao lưu (' + Object.keys(bk.db.people).length + ' người)' }]);
    write_(d);
    return { rev: d.rev, db: d.db, list: bkList_() };
  }
  if (A == 'settings') {
    const F = ['tree', 'ev', 'cal', 'ho', 'kin', 'album', 'stat', 'doc'], nv = { xem: {}, 'de-xuat': {} }, qv = q.vis || {}, df = q.defaults || {};
    ['xem', 'de-xuat'].forEach(r => F.forEach(f => { if (qv[r] && qv[r][f] === false) nv[r][f] = false; }));
    d.vis = nv;
    d.defaults = { role: df.role == 'xem' ? 'xem' : 'de-xuat', contact: !!df.contact, export: !!df.export };
    write_(d);
    return { vis: d.vis, defaults: d.defaults };
  }

  if (A == 'save') {
    if (q.rev != d.rev) return { err: 'conflict' };
    backup_(d);
    const df = diff_(d.db, q.db), t = Date.now();
    log_(d, df.length > 40 ? [{ at: t, by: me, act: 'nhieu', n: df.length + ' mục thay đổi' }] : df.map(x => Object.assign({ at: t, by: me }, x)));
    d.db = q.db; d.rev++; write_(d);
    return { rev: d.rev };
  }
  if (A == 'review') {
    const x = d.queue.filter(z => z.id == q.id && z.status == 'cho')[0];
    if (!x) return { err: 'Đề xuất không còn chờ duyệt' };
    const f = x.op == 'edit' && x.person && d.db.people[x.pid] ? changed_(d.db.people[x.pid], x.person) : undefined;
    if (q.ok) {
      if (x.op == 'edit' && !d.db.people[x.pid]) return { err: 'Người này đã bị xoá khỏi gia phả' };
      if (x.op == 'add' && d.db.people[x.pid]) return { err: 'Mã người đã tồn tại, hãy từ chối đề xuất này' };
      backup_(d); apply_(d.db, x); d.rev++;
    }
    x.status = q.ok ? 'duyet' : 'tuchoi';
    if (!q.ok) x.why = String(q.why || '').slice(0, 300);
    const nn = nt_(d);
    if (nn.member && x.by != owner_()) mail_(x.by, 'Gia phả: đề xuất của bạn đã ' + (q.ok ? 'được duyệt' : 'bị từ chối'),
      'Đề xuất ' + OPV[x.op] + ' "' + (x.name || (x.person && x.person.name) || '') + '" đã ' + (q.ok ? 'được quản trị viên duyệt và áp dụng.' : 'bị từ chối.') + (!q.ok && x.why ? '\nLý do: ' + x.why : '') + link_(nn));
    log_(d, [{ at: Date.now(), by: me, act: q.ok ? 'duyet' : 'tuchoi', from: x.by, op: x.op, n: x.name || (x.person && x.person.name) || '', f: f }]);
    write_(d);
    return { rev: d.rev, db: d.db, queue: d.queue };
  }
  if (A == 'member') { // thay đổi MỘT thành viên, không ghi đè cả danh sách (tránh mất dữ liệu khi có hai quản trị viên)
    const e = String(q.email || '').toLowerCase().trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) || e == owner_()) return { err: 'Email không hợp lệ hoặc là tài khoản chủ' };
    d.members = d.members || {}; d.contact = d.contact || {}; d.exports = d.exports || {};
    if (me != owner_() && (q.role == 'quan-tri' || d.members[e] == 'quan-tri')) return { err: 'Chỉ tài khoản chủ mới được cấp, đổi hoặc thu hồi quyền quản trị viên' };
    const t = Date.now(), ent = [];
    if (q.del) {
      if (d.members[e]) { delete d.members[e]; delete d.contact[e]; delete d.exports[e]; ent.push({ at: t, by: me, act: 'tv', n: e, f: ['Bỏ khỏi danh sách'] }); }
    } else {
      if (q.role !== undefined) {
        if (['quan-tri', 'de-xuat', 'xem'].indexOf(q.role) < 0) return { err: 'Quyền không hợp lệ' };
        const old = d.members[e]; d.members[e] = q.role;
        if (old != q.role) ent.push({ at: t, by: me, act: 'tv', n: e, f: [(old ? 'Đổi quyền: ' : 'Mời, quyền: ') + q.role] });
        if (q.role == 'quan-tri') { delete d.contact[e]; delete d.exports[e]; }
      }
      if (q.contact !== undefined) {
        if (!d.members[e]) return { err: 'Người này chưa được mời' };
        const nv = !!q.contact;
        if (d.members[e] != 'quan-tri' && !!d.contact[e] != nv) { if (nv) d.contact[e] = true; else delete d.contact[e]; ent.push({ at: t, by: me, act: 'tv', n: e, f: [nv ? 'Cho xem thông tin liên hệ' : 'Thu quyền xem liên hệ'] }); }
      }
      if (q.export !== undefined) {
        if (!d.members[e]) return { err: 'Người này chưa được mời' };
        const ev = !!q.export;
        if (d.members[e] != 'quan-tri' && !!d.exports[e] != ev) { if (ev) d.exports[e] = true; else delete d.exports[e]; ent.push({ at: t, by: me, act: 'tv', n: e, f: [ev ? 'Cho phép xuất danh sách' : 'Thu quyền xuất danh sách'] }); }
      }
    }
    log_(d, ent); write_(d);
    return { members: d.members, contact: d.contact, exports: d.exports };
  }
  if (A == 'putImg' || A == 'delImg') {
    const f = folder_(), it = f.getFilesByName(q.id + '.jpg');
    while (it.hasNext()) it.next().setTrashed(true);
    if (A == 'putImg') f.createFile(Utilities.newBlob(Utilities.base64Decode(q.data), 'image/jpeg', q.id + '.jpg'));
    return { ok: 1 };
  }
  return { err: 'Yêu cầu không hợp lệ' };
}
