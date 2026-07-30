/* ============================================================================
   agg.js — LỚP ĐẾM THEO KHOẢNG NGÀY
   ----------------------------------------------------------------------------
   Trước 29/07/2026 mọi con số trên trang được build.py nấu sẵn theo đúng hai kỳ:
   tuần hiện tại (khóa *W) và tháng hiện tại (khóa *M). Muốn xem "ngày 12/07" hay
   "05/07 → 11/07" thì không có cách nào, vì kỳ nào không nấu sẵn thì không tồn tại.

   Nay build.py gửi kèm `facts.js` = 1 dòng/ticket đã nén theo cột, và file này dựng
   lại ĐÚNG những hàm đếm mà build.py từng chạy — cùng tên, cùng hình dạng kết quả —
   nhưng chạy trên khoảng ngày người dùng đang chọn. Nhờ giữ nguyên hình dạng trả về,
   toàn bộ hàm vẽ trong index.html không phải sửa: chỉ đổi chỗ lấy dữ liệu.

   Quy ước bắt buộc khi sửa file này:
   - Danh mục và THỨ TỰ hiển thị (lớp phân loại, lý do disclaim, trạng thái SLA...)
     lấy từ `D.enums` do build.py xuất — KHÔNG chép cứng vào đây, vì mỗi lần thêm một
     nhóm lý do là hai bên lệch nhau âm thầm.
   - Mọi thay đổi công thức phải sửa SONG SONG với build.py, và chạy `verify_agg.js`
     để đối chiếu: chọn đúng khoảng ngày của tuần báo cáo phải ra khớp số nấu sẵn.
   ============================================================================ */
(function (global) {
'use strict';

var F = null;      // REPORT_FACTS
var E = null;      // D.enums
var IX = {};       // từ điển đảo: IX.BD['Disclaim'] -> số
var DAY = null;    // ngày (chỉ số) của từng dòng, dựng lại từ dayStart
var SEL = null;    // Int32Array chỉ số dòng đang chọn
var LIMH = null;   // lim_h đã ép về số, tra theo chỉ số từ điển
var STATE = { from: '', to: '', src: 'api', slaRule: 'zone' };

/* ---- khởi tạo ---------------------------------------------------------- */
function init(facts, enums) {
  F = facts; E = enums;
  IX = {};
  Object.keys(F.dicts).forEach(function (c) {
    var m = Object.create(null);
    F.dicts[c].forEach(function (v, i) { m[v] = i; });
    IX[c] = m;
  });
  /* Cột `day` không được gửi kèm (dư ~0,46MB) — dựng lại một lần từ dayStart.
     Dòng đã xếp theo ngày tăng dần nên đây chỉ là một vòng lặp phẳng. */
  DAY = new Int32Array(F.n);
  for (var d = 0; d < F.days.length; d++) {
    for (var i = F.dayStart[d]; i < F.dayStart[d + 1]; i++) DAY[i] = d;
  }
  LIMH = F.dicts.lim_h.map(function (v) { return parseFloat(v); });
  OVD_I = ix('ovdf', 'Overdue'); ON_I = ix('ovdf', 'Ontime');
  return API;
}

/* Chỉ số của một mã trong từ điển; -1 nếu kho không có giá trị đó (khoảng ngày
   không chứa ticket nào thuộc nhóm đó — phải trả 0 chứ không được nổ). */
function ix(col, name) { var v = IX[col][name]; return v === undefined ? -1 : v; }
function dayIndex(iso) {
  var lo = 0, hi = F.days.length - 1;
  if (!F.days.length || iso < F.days[0]) return 0;
  if (iso > F.days[hi]) return hi + 1;
  while (lo <= hi) {                     // ngày không có ticket thì không có trong days
    var mid = (lo + hi) >> 1;
    if (F.days[mid] === iso) return mid;
    if (F.days[mid] < iso) lo = mid + 1; else hi = mid - 1;
  }
  return lo;
}

/* ---- chọn khoảng ngày + luồng tạo ticket -------------------------------- */
function select(from, to, src) {
  /* Giữ slaRule: select() bị gọi lại mỗi lần đổi khoảng ngày / so kỳ trước, gán đè
     cả object sẽ âm thầm trả luật về 'zone' giữa chừng một lần vẽ. */
  STATE = { from: from, to: to, src: src || 'api', slaRule: STATE.slaRule };
  var a = dayIndex(from), b = dayIndex(to);
  if (b < F.days.length && F.days[b] === to) b += 1;   // 'to' tính CẢ ngày đó
  var lo = F.dayStart[Math.min(a, F.days.length)] || 0;
  var hi = F.dayStart[Math.min(b, F.days.length)] || 0;
  var apiIx = ix('source', E.srcApi), out = [];
  for (var i = lo; i < hi; i++) {
    var s = F.cols.source[i];
    if (STATE.src === 'api' && s !== apiIx) continue;
    if (STATE.src === 'other' && s === apiIx) continue;
    out.push(i);
  }
  SEL = Int32Array.from(out);
  return SEL.length;
}

/* Lát cắt phụ: dùng khi một khối cần phạm vi khác khối đang chọn (ví dụ luồng API
   trong khi trang đang xem "tất cả"), hoặc cần một khoảng con để so kỳ trước. */
function slice(fromDay, toDay, srcMode) {
  var lo = F.dayStart[Math.max(0, Math.min(fromDay, F.days.length))];
  var hi = F.dayStart[Math.max(0, Math.min(toDay, F.days.length))];
  var apiIx = ix('source', E.srcApi), out = [];
  for (var i = lo; i < hi; i++) {
    var s = F.cols.source[i];
    if (srcMode === 'api' && s !== apiIx) continue;
    if (srcMode === 'other' && s === apiIx) continue;
    out.push(i);
  }
  return Int32Array.from(out);
}

/* ---- tiện ích đếm ------------------------------------------------------- */
function rowsOf(seg, sel) {
  sel = sel || SEL;
  if (!seg || seg === 'all') return sel;
  var g = ix('BG', seg), out = [];
  for (var k = 0; k < sel.length; k++) if (F.cols.BG[sel[k]] === g) out.push(sel[k]);
  return Int32Array.from(out);
}
function countBy(rows, col) {          // {giá trị: số lượng} theo NHÃN
  var c = F.cols[col], dict = F.dicts[col], acc = Object.create(null);
  for (var k = 0; k < rows.length; k++) {
    var v = dict[c[rows[k]]];
    acc[v] = (acc[v] || 0) + 1;
  }
  return acc;
}
function countEq(rows, col, name) {
  var want = ix(col, name); if (want < 0) return 0;
  var c = F.cols[col], n = 0;
  for (var k = 0; k < rows.length; k++) if (c[rows[k]] === want) n++;
  return n;
}
function distinct(rows, col, skipEmpty) {
  var c = F.cols[col], empty = ix(col, ''), s = new Set();
  for (var k = 0; k < rows.length; k++) {
    var v = c[rows[k]];
    if (skipEmpty && v === empty) continue;
    s.add(v);
  }
  return s.size;
}
/* Xếp nhiều -> ít, BẰNG ĐIỂM thì theo tên — phải khớp build._ranked(), nếu không hai
   bên ra cùng số nhưng khác thứ tự và không đối chiếu được. */
function ranked(byName) {
  return Object.keys(byName).sort(function (a, b) {
    return byName[b] - byName[a] || (a < b ? -1 : a > b ? 1 : 0);
  });
}
function pct(vals, q) {                 // giống build._pct (làm tròn 1 chữ số)
  if (!vals.length) return null;
  var v = vals.slice().sort(function (a, b) { return a - b; });
  var i = Math.min(v.length - 1, Math.max(0, Math.round(q * (v.length - 1))));
  return Math.round(v[i] * 10) / 10;
}
var div = function (a, b) { return b ? a / b : 0; };

/* ---- LUẬT CHẤM SLA -------------------------------------------------------
   'zone' (mặc định) = luật báo cáo đang chạy: SLA nhanh theo vùng 3h/4h/7h cho trạm
     HN + Tự doanh luồng API, phần còn lại dùng thẳng cờ SLA của CCTS (cột `ovdf`).
     Đây là luật build.py nấu sẵn các khối *W, nên verify_agg.js chỉ đúng ở chế độ này.
   'h48' (user chốt 30/07/2026) = MỘT ngưỡng duy nhất cho mọi tỉnh/nguồn:
     Open -> Solution ĐẦU TIÊN <= 48h là Đạt, > 48h là Quá hạn (quy lỗi KTV).
     * Ticket CHƯA CÓ solution KHÔNG vào mẫu số — nó là tồn đọng, không phải phép đo
       tốc độ xử lý. Vì thế mới có hasVerdict(): khối lượng ticket giữ nguyên, chỉ
       MẪU SỐ của tỉ lệ quá hạn co lại.
     * VOMS reject / lỗi hệ thống được chấp nhận là Đạt, nhưng chỉ khi solution đầu còn
       trong 48h — mà ca <=48h thì vốn đã Đạt, nên mệnh đề này không đổi con số. Ca đã
       quá 48h vẫn tính lỗi KTV: VOMS chỉ reject SAU khi KTV nộp solution, trễ đã xảy ra
       trước đó. Giữ nguyên quyết định này khi sửa, đừng "sửa lại cho nhất quán".
   Toàn bộ trang đọc SLA qua 3 hàm dưới đây — thêm chỗ đếm mới thì cũng phải đi qua
   chúng, đừng đọc thẳng F.cols.ovdf. */
var SLA_H48 = 48;
var SYS_STATUS = ['Pending for others', 'Pending for closure'];
var OVD_I = -1, ON_I = -1;

function isOvd(i) {
  if (STATE.slaRule === 'h48') { var p = F.nums.proc_h[i]; return p !== null && p > SLA_H48; }
  return F.cols.ovdf[i] === OVD_I;
}
function isOn(i) {
  if (STATE.slaRule === 'h48') { var p = F.nums.proc_h[i]; return p !== null && p <= SLA_H48; }
  return F.cols.ovdf[i] === ON_I;
}
/* Ticket có được chấm hay không. Chế độ 'zone' LUÔN trả true để mẫu số y hệt trước đây
   (verify_agg.js 25/25 phụ thuộc vào điều này). */
function hasVerdict(i) {
  return STATE.slaRule === 'h48' ? F.nums.proc_h[i] !== null : true;
}
/* Hạn của chính ticket đó — dùng cho cột "% ca trong hạn" của bảng hiệu suất. */
function limOf(i) {
  return STATE.slaRule === 'h48' ? SLA_H48 : LIMH[F.cols.lim_h[i]];
}
function setSlaRule(rule) {
  STATE.slaRule = rule === 'h48' ? 'h48' : 'zone';
  return STATE.slaRule;
}

/* ---- các khối số (hình dạng khớp build.py) ------------------------------ */
function classification(seg, fleetTotal, sel) {
  var rows = rowsOf(seg, sel), total = rows.length, out = [];
  E.classes.forEach(function (c) {
    var q = countEq(rows, 'BD', c);
    out.push({ name: c, qty: q, share: div(q, total), rate: div(q, fleetTotal) });
  });
  return [out, { qty: total, rate: div(total, fleetTotal) }];
}

function disclaim(seg, sel) {
  var rows = rowsOf(seg, sel), dis = ix('BD', 'Disclaim');
  var sub = [], bd = F.cols.BD;
  for (var k = 0; k < rows.length; k++) if (bd[rows[k]] === dis) sub.push(rows[k]);
  var total = sub.length;
  return E.disOrder.map(function (r) {
    var q = countEq(sub, 'BE', r);
    return { name: r, qty: q, share: div(q, total) };
  });
}

function bdSource(seg, sel) {
  var rows = rowsOf(seg, sel), n = rows.length;
  var by = countBy(rows, 'bd_src');
  by['Chưa xác định'] = (by['Chưa xác định'] || 0) + (by[''] || 0);   // rỗng = chưa xác định
  var out = E.bdSrcOrder.concat(['Chưa xác định']).map(function (s) {
    var q = by[s] || 0;
    return { name: s, qty: q, share: div(q, n) };
  });
  return { total: n, rows: out };
}

function undefBreakdown(seg, sel) {
  var rows = rowsOf(seg, sel), un = ix('BD', E.bdUndef);
  var sub = [], bd = F.cols.BD;
  for (var k = 0; k < rows.length; k++) if (bd[rows[k]] === un) sub.push(rows[k]);
  var total = sub.length, by = countBy(sub, 'ufam'), out = [];
  E.undefFamilies.forEach(function (name) {
    var q = by[name] || 0;
    if (q) out.push({ name: name, qty: q, share: div(q, total) });
  });
  return { total: total, rows: out };
}

function rootcause(seg, sel) {
  var rows = rowsOf(seg, sel), total = rows.length, by = countBy(rows, 'RC'), out = [];
  E.rcNames.forEach(function (name) {
    var q = by[name] || 0;
    if (!q && name === 'Chưa xác định') return;
    out.push({ name: name, qty: q, share: div(q, total), cls: E.rcClass[name] || '' });
  });
  out.sort(function (a, b) { return b.qty - a.qty; });
  return out;
}

function rcCoverage(seg, sel) {
  var rows = rowsOf(seg, sel), n = rows.length;
  var empty = ix('rc_src', ''), c = F.cols.rc_src, w = 0;
  for (var k = 0; k < rows.length; k++) if (c[rows[k]] !== empty) w++;
  return { total: n, withText: w, rate: div(w, n) };
}

function rcCross(seg, sel) {
  var rows = rowsOf(seg, sel), out = [];
  E.rcNames.forEach(function (name) {
    var want = ix('RC', name); if (want < 0) return;
    var sub = [], c = F.cols.RC;
    for (var k = 0; k < rows.length; k++) if (c[rows[k]] === want) sub.push(rows[k]);
    if (!sub.length) return;
    var row = { name: name, qty: sub.length };
    E.classes.forEach(function (cl) { row[cl] = countEq(sub, 'BD', cl); });
    out.push(row);
  });
  out.sort(function (a, b) { return b.qty - a.qty; });
  return out;
}

function alarmRca(seg, sel) {
  var rows = rowsOf(seg, sel), empty = ix('code', ''), c = F.cols.code;
  var sub = [];
  for (var k = 0; k < rows.length; k++) if (c[rows[k]] !== empty) sub.push(rows[k]);
  if (!sub.length) return [];
  var by = countBy(sub, 'code');
  var top = ranked(by).slice(0, E.alarmTop);
  var rcEmpty = ix('rc_src', '');
  return top.map(function (code) {
    var want = ix('code', code), s = [], st = [];
    for (var k = 0; k < sub.length; k++) {
      if (c[sub[k]] !== want) continue;
      s.push(sub[k]);
      if (F.cols.rc_src[sub[k]] !== rcEmpty) st.push(sub[k]);
    }
    var byRc = countBy(st, 'RC');
    var reasons = ranked(byRc).map(function (g) {
      return { name: g, qty: byRc[g], share: div(byRc[g], st.length) };
    });
    return { code: code, qty: s.length, withText: st.length,
             thin: st.length < E.alarmMinText, reasons: reasons };
  });
}

function fail(models, fleet, sel) {
  var rows = sel || SEL, out = [], tS = 0, tF = 0, tT = 0;
  var dis = ix('BD', 'Disclaim'), at = F.cols.AT, bd = F.cols.BD;
  models.forEach(function (mdl) {
    var want = ix('AT', mdl), nondis = [];
    for (var k = 0; k < rows.length; k++) {
      var i = rows[k];
      if (at[i] === want && bd[i] !== dis) nondis.push(i);
    }
    var failed = distinct(nondis, 'cpid', true), tickets = nondis.length;
    var on = fleet[mdl] || 0;
    out.push({ model: mdl, onService: on, failed: failed, failRate: div(failed, on),
               tickets: tickets, freq: div(tickets, failed) });
    tS += on; tF += failed; tT += tickets;
  });
  out.push({ model: 'Total', onService: tS, failed: tF, failRate: div(tF, tS),
             tickets: tT, freq: div(tT, tF) });
  return out;
}

/* Đây là bảng DUY NHẤT mà mẫu số co lại ở chế độ h48: cột Total chính là mẫu số của
   Ontime/Overdue, để nguyên ticket chưa có solution thì ontime + overdue != total và
   bảng trông như tính sai. Số ticket bị loại ra được nói riêng ở dải chú thích. */
/* Danh sách trạng thái của bảng SLA.
   'zone': đúng 13 trạng thái theo bố cục sheet Report gốc (build.SLA_STATUSES) — ticket
     ngoài 13 nhóm cố tình không được đếm, xem build.py:sla_table.
   'h48': luật 48h KHÔNG phụ thuộc trạng thái ticket, nên giữ nguyên phép loại trừ đó là
     sai — riêng 'Pending for VOMS confirm' đã là ~19% kho và những ticket đó có solution,
     chấm được bình thường. Lấy danh sách từ CHÍNH dữ liệu (không chép cứng, đúng quy ước
     "danh mục lấy từ D.enums hoặc từ kho, không viết tay trong file này"). */
function statusList() {
  if (STATE.slaRule !== 'h48') return E.slaStatuses;
  return F.dicts.status.filter(function (s) { return s; }).slice().sort();
}

function slaTable(seg, sel) {
  var rows = rowsOf(seg, sel);
  var grand = 0, tO = 0, tOn = 0, stat = [];
  statusList().forEach(function (st) {
    var want = ix('status', st), total = 0, ontime = 0;
    for (var k = 0; k < rows.length; k++) {
      var i = rows[k];
      if (F.cols.status[i] !== want) continue;
      if (!hasVerdict(i)) continue;
      total++;
      if (isOn(i)) ontime++;
    }
    grand += total; tOn += ontime; tO += total - ontime;
    stat.push([st, total, ontime, total - ontime]);
  });
  var out = stat.map(function (r) {
    return { status: r[0], total: r[1], ontime: r[2], overdue: r[3], share: div(r[3], grand) };
  });
  out.push({ status: 'Grand total', total: grand, ontime: tOn, overdue: tO,
             share: div(tO, grand) });
  return out;
}

function resourceTable(slaRows) {
  var by = {}; slaRows.forEach(function (r) { by[r.status] = r; });
  var g = by['Grand total'], out = [], covered = 0;
  Object.keys(E.resources).forEach(function (res) {
    var t = 0, on = 0, ov = 0;
    E.resources[res].forEach(function (s) {
      var r = by[s]; if (!r) return;
      t += r.total; on += r.ontime; ov += r.overdue;
    });
    covered += t;
    out.push({ res: res, total: t, ontime: on, overdue: ov,
               rate: div(ov, t), share: div(ov, g.total) });
  });
  /* Ở chế độ h48 bảng SLA phủ nhiều trạng thái hơn 13 nhóm resource (xem statusList),
     nên phần dư phải hiện thành một dòng, nếu không các dòng cộng lại không ra Grand
     total và bảng trông như tính thiếu. Chế độ 'zone' phần dư luôn = 0 -> không thêm. */
  if (g.total - covered > 0) {
    var rt = g.total - covered, ron = g.ontime, rov = g.overdue;
    out.forEach(function (r) { ron -= r.ontime; rov -= r.overdue; });
    out.push({ res: 'Ngoài các nhóm trên', total: rt, ontime: ron, overdue: rov,
               rate: div(rov, rt), share: div(rov, g.total) });
  }
  out.push({ res: 'Grand total', total: g.total, ontime: g.ontime, overdue: g.overdue,
             rate: div(g.overdue, g.total), share: div(g.overdue, g.total) });
  return out;
}

/* ---- chuỗi theo kỳ: kỳ nay là BUCKET suy từ khoảng ngày ------------------ */
/* Khoảng ngắn thì chia theo NGÀY, dài hơn theo TUẦN, rất dài theo THÁNG — nếu luôn
   chia theo ngày thì chọn cả năm sẽ ra 210 cột không đọc được, còn luôn theo tuần
   thì chọn 3 ngày sẽ chỉ ra 1 cột. */
function buckets(from, to) {
  var a = dayIndex(from), b = dayIndex(to);
  if (b < F.days.length && F.days[b] === to) b += 1;
  var span = (Date.parse(to) - Date.parse(from)) / 86400000 + 1;
  var unit = span <= 21 ? 'day' : (span <= 130 ? 'week' : 'month');
  var out = [], cur = null;
  function keyOf(iso) {
    if (unit === 'day') return iso;
    if (unit === 'month') return iso.slice(0, 7);
    var d = new Date(iso + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));   // về thứ Hai
    return d.toISOString().slice(0, 10);
  }
  for (var i = a; i < b && i < F.days.length; i++) {
    var k = keyOf(F.days[i]);
    if (!cur || cur.key !== k) { cur = { key: k, from: i, to: i + 1 }; out.push(cur); }
    else cur.to = i + 1;
  }
  return { unit: unit, list: out,
           labels: out.map(function (b2) {
             return unit === 'month' ? b2.key : b2.key.slice(5).split('-').reverse().join('/');
           }) };
}

function bucketRows(b, srcMode) { return slice(b.from, b.to, srcMode || STATE.src); }

function trend(models, fleet, bk, srcMode) {
  var tickets = [], failrate = [], faileds = [], freqs = [];
  var per = bk.list.map(function (b) { return bucketRows(b, srcMode); });
  var dis = ix('BD', 'Disclaim'), at = F.cols.AT, bd = F.cols.BD;
  models.forEach(function (mdl) {
    var want = ix('AT', mdl), tr = [], fr = [], dr = [], qr = [];
    var on = fleet[mdl] || 0;
    per.forEach(function (rows) {
      var sub = [];
      for (var k = 0; k < rows.length; k++) {
        var i = rows[k];
        if (at[i] === want && bd[i] !== dis) sub.push(i);
      }
      var failed = distinct(sub, 'cpid', true);
      tr.push(sub.length); dr.push(failed);
      fr.push(div(failed, on)); qr.push(div(sub.length, failed));
    });
    tickets.push(tr); failrate.push(fr); faileds.push(dr); freqs.push(qr);
  });
  return { models: models, tickets: tickets, failRate: failrate, failed: faileds, freq: freqs };
}

/* `total` là KHỐI LƯỢNG ticket nên không phụ thuộc luật SLA; chỉ mẫu số của `rate` mới
   co lại ở chế độ h48. Ở chế độ 'zone' d === t nên số ra y hệt trước đây. */
function aspBlock(seg, bk) {
  var per = bk.list.map(function (b) { return rowsOf(seg, bucketRows(b)); });
  var total = [], overdue = [], rate = [];
  E.asps.forEach(function (asp) {
    var want = ix('asp', asp), tr = [], or = [], rr = [];
    per.forEach(function (rows) {
      var t = 0, o = 0, d = 0;
      for (var k = 0; k < rows.length; k++) {
        var i = rows[k];
        if (F.cols.asp[i] !== want) continue;
        t++;
        if (!hasVerdict(i)) continue;
        d++;
        if (isOvd(i)) o++;
      }
      tr.push(t); or.push(o); rr.push(div(o, d));
    });
    total.push(tr); overdue.push(or); rate.push(rr);
  });
  return { asps: E.asps, total: total, overdue: overdue, rate: rate };
}

function rcTrend(seg, bk, top) {
  top = top || 8;
  var all = rowsOf(seg), by = countBy(all, 'RC');
  var groups = ranked(by).filter(function (g) { return g !== 'Chưa xác định'; }).slice(0, top);
  var per = bk.list.map(function (b) { return rowsOf(seg, bucketRows(b)); });
  var series = groups.map(function (g) {
    var want = ix('RC', g);
    return per.map(function (rows) {
      var n = 0;
      for (var k = 0; k < rows.length; k++) if (F.cols.RC[rows[k]] === want) n++;
      return n;
    });
  });
  return { groups: groups, series: series };
}

function timeSeries(bk) {
  var out = {};
  ['EVCS', 'BSS', 'all'].forEach(function (seg) {
    var med = [], p90 = [], voms = [], slow = [], done = [];
    bk.list.forEach(function (b) {
      var rows = rowsOf(seg === 'all' ? null : seg, bucketRows(b));
      var proc = [], vv = [];
      for (var k = 0; k < rows.length; k++) {
        var p = F.nums.proc_h[rows[k]], r = F.nums.round1h[rows[k]];
        if (p !== null) proc.push(p);
        if (r !== null) vv.push(r);
      }
      med.push(pct(proc, .5)); p90.push(pct(proc, .9)); voms.push(pct(vv, .5));
      slow.push(proc.filter(function (v) { return v > 48; }).length);
      done.push(proc.length);
    });
    out[seg] = { med: med, p90: p90, voms: voms, slow: slow, done: done };
  });
  return out;
}

/* ---- hiệu suất: chỉ tính được khi có từng ticket (trung vị không cộng được) */
function perf(bk) {
  var dims = { team: 'bf', asp: 'asp', prov: 'prov' };
  var acc = {};
  function bump(dim, key, bi, i) {
    var k = dim + ' ' + key + ' ' + bi;
    var c = acc[k] || (acc[k] = { dim: dim, key: key, bi: bi, qty: 0, den: 0, ovd: 0,
                                  open: 0, ontime: 0, proc: [], voms: [] });
    c.qty++;                                   // khối lượng — không phụ thuộc luật SLA
    if (hasVerdict(i)) { c.den++; if (isOvd(i)) c.ovd++; }
    var p = F.nums.proc_h[i];
    if (p === null) c.open++;
    else { c.proc.push(p); if (p <= limOf(i)) c.ontime++; }
    var r = F.nums.round1h[i];
    if (r !== null) c.voms.push(r);
  }
  bk.list.forEach(function (b, bi) {
    var rows = bucketRows(b);
    for (var k = 0; k < rows.length; k++) {
      var i = rows[k];
      Object.keys(dims).forEach(function (dim) {
        var lbl = F.dicts[dims[dim]][F.cols[dims[dim]][i]];
        if (dim === 'prov') lbl = provName(lbl);
        if (lbl) bump(dim, lbl, bi, i);
      });
      bump('all', 'Toàn quốc', bi, i);
    }
  });
  var last = bk.list.length - 1, out = {};
  E.perfDims.forEach(function (dim) {
    var keys = {};
    Object.keys(acc).forEach(function (k) { if (acc[k].dim === dim) keys[acc[k].key] = 1; });
    var rows = [];
    Object.keys(keys).sort().forEach(function (key) {
      var cur = acc[dim + ' ' + key + ' ' + last];
      if (!cur || !cur.qty) return;
      var series = bk.list.map(function (_b, bi) {
        var c = acc[dim + ' ' + key + ' ' + bi];
        return c && c.den ? Math.round(c.ovd / c.den * 1e4) / 1e4 : null;
      });
      rows.push({ k: key, qty: cur.qty, ovd: cur.ovd, open: cur.open,
                  rate: cur.den ? Math.round(cur.ovd / cur.den * 1e4) / 1e4 : 0,
                  med: cur.proc.length ? pct(cur.proc, .5) : null,
                  ontime: cur.proc.length ? Math.round(cur.ontime / cur.proc.length * 1e4) / 1e4 : null,
                  voms: cur.voms.length ? pct(cur.voms, .5) : null,
                  series: series });
    });
    rows.sort(function (a, b) { return b.qty - a.qty; });
    out[dim] = rows;
  });
  return out;
}

function provName(code) {
  var info = E.provinces[code];
  return info ? info[0] : (code || '—');
}

/* ---- overdue: theo kỳ, tình huống, danh sách giải trình ------------------ */
/* Ở chế độ h48, `open` là ticket CHƯA có solution — đã bị loại khỏi mẫu số `total`, nên
   nó đứng cạnh biểu đồ như phần tồn đọng chứ không còn là một lát của overdue. Và vì
   quá hạn h48 nghĩa là p > 48 nên `breach` trùng `sys`: hai đường chồng nhau là ĐÚNG,
   không phải lỗi vẽ — luật này không tách được "đã xong nhưng trễ" khỏi "chưa xong". */
function overdueByBucket(bk) {
  return bk.list.map(function (b, i) {
    var rows = bucketRows(b, 'api'), total = 0;
    var sys = 0, breach = 0, open = 0;
    for (var k = 0; k < rows.length; k++) {
      var r = rows[k];
      if (!hasVerdict(r)) { open++; continue; }
      total++;
      if (!isOvd(r)) continue;
      sys++;
      var p = F.nums.proc_h[r];
      if (p === null) { open++; continue; }
      var lim = limOf(r), v = F.nums.round1h[r];
      if (p > lim || (v !== null && v > lim)) breach++;
    }
    return { week: bk.labels[i], total: total, sys: sys, breach: breach, open: open,
             rate: div(sys, total), breachRate: div(breach, total), openRate: div(open, total) };
  });
}

/* Cột `scn` do build.py chấm theo luật vùng và CHỈ điền cho ticket vùng-overdue, nên ở
   chế độ h48 nó vô nghĩa (tập overdue khác hẳn, phần lớn để rỗng). Luật h48 lại khiến
   mọi ca quá hạn đều là "Xử lý muộn" theo đúng định nghĩa, nên thay vì vẽ một chiếc bánh
   một màu, chia theo việc ca đó có kèm cờ khách quan hay không — đúng bảng "Đối chiếu
   luật" của file giải trình Excel. */
var H48_SCN = ['Quá 48h — không có tình tiết khác',
               'Quá 48h + VOMS reject',
               'Quá 48h + lỗi hệ thống'];

function scenarioBreak() {
  var rows = slice(dayIndex(STATE.from), endDay(), 'api');
  var cnt = {}, order = STATE.slaRule === 'h48' ? H48_SCN : E.scenarios;
  order.forEach(function (s) { cnt[s] = 0; });
  for (var k = 0; k < rows.length; k++) {
    var i = rows[k];
    if (!isOvd(i)) continue;
    if (STATE.slaRule === 'h48') {
      var st = F.dicts.status[F.cols.status[i]];
      cnt[F.flags.rejected[i] === 1 ? H48_SCN[1]
          : SYS_STATUS.indexOf(st) >= 0 ? H48_SCN[2] : H48_SCN[0]]++;
    } else {
      var s = F.dicts.scn[F.cols.scn[i]];
      if (s in cnt) cnt[s]++;
    }
  }
  return order.filter(function (s) { return cnt[s]; })
              .map(function (s) { return { name: s, qty: cnt[s] }; });
}

function endDay() {
  var b = dayIndex(STATE.to);
  if (b < F.days.length && F.days[b] === STATE.to) b += 1;
  return b;
}

function sourceSplit() {
  var lo = F.dayStart[dayIndex(STATE.from)], hi = F.dayStart[Math.min(endDay(), F.days.length)];
  var apiIx = ix('source', E.srcApi);
  var o = { api: { total: 0, ovd: 0 }, other: { total: 0, ovd: 0 } };
  for (var i = lo; i < hi; i++) {
    if (!hasVerdict(i)) continue;
    var b = F.cols.source[i] === apiIx ? o.api : o.other;
    b.total++;
    if (isOvd(i)) b.ovd++;
  }
  o.api.rate = div(o.api.ovd, o.api.total);
  o.other.rate = div(o.other.ovd, o.other.total);
  return o;
}

/* Số ticket + overdue rate theo bucket — nguồn của badge so kỳ và cảnh báo sớm. */
function segSeries(seg, bk, fleetTotal) {
  var qty = [], rate = [], tot = [];
  bk.list.forEach(function (b) {
    /* n = khối lượng (giữ nguyên mọi luật); d = mẫu số của tỉ lệ quá hạn. */
    var rows = rowsOf(seg, bucketRows(b)), n = rows.length, o = 0, d = 0;
    for (var k = 0; k < rows.length; k++) {
      var i = rows[k];
      if (!hasVerdict(i)) continue;
      d++;
      if (isOvd(i)) o++;
    }
    qty.push(fleetTotal ? div(n, fleetTotal) : n);
    tot.push(n); rate.push(div(o, d));
  });
  return { qty: qty, rate: rate, total: tot };
}

var API = {
  init: init, select: select, slice: slice, buckets: buckets, state: function () { return STATE; },
  setSlaRule: setSlaRule, slaRule: function () { return STATE.slaRule; }, SLA_H48: SLA_H48,
  days: function () { return F.days; }, size: function () { return SEL ? SEL.length : 0; },
  rowsOf: rowsOf, dayIndex: dayIndex, endDay: endDay, provName: provName,
  classification: classification, disclaim: disclaim, bdSource: bdSource,
  undefBreakdown: undefBreakdown, rootcause: rootcause, rcCoverage: rcCoverage,
  rcCross: rcCross, alarmRca: alarmRca, fail: fail, slaTable: slaTable,
  resourceTable: resourceTable, trend: trend, rcTrend: rcTrend, aspBlock: aspBlock,
  timeSeries: timeSeries,
  perf: perf, overdueByBucket: overdueByBucket, scenarioBreak: scenarioBreak,
  sourceSplit: sourceSplit, segSeries: segSeries, countBy: countBy, countEq: countEq,
  raw: function () { return { F: F, E: E, SEL: SEL, DAY: DAY, LIMH: LIMH, ix: ix }; }
};
global.AGG = API;
})(typeof window !== 'undefined' ? window : globalThis);
