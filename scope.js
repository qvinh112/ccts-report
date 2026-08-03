/* ============================================================================
   scope.js — LỚP ĐẾM BỔ SUNG cho bản dựng lại theo scope công việc (31/07/2026)
   ----------------------------------------------------------------------------
   Vì sao là file RIÊNG chứ không viết thêm vào agg.js:

   `agg.js` là bản dựng lại y hệt các hàm đếm của build.py, và `verify_agg.js` khóa
   nó ở 25/25 khối trùng khít với số nấu sẵn. Mọi con số ở đây là ĐỊNH NGHĨA MỚI
   (chưa từng có trong build.py) nên không có bản nấu sẵn để đối chiếu — trộn vào
   agg.js là làm hỏng ý nghĩa của cổng kiểm đó. File này chỉ ĐỌC qua AGG.raw().

   Ba tầng chỉ số (user chốt 31/07/2026, thay cách đếm cũ `BD != "Disclaim"`):

     Tầng 1 — TẢI VẬN HÀNH        : mọi ticket. Dùng cho nhân sự, SLA, ASP.
     Tầng 2 — LỖI THIẾT BỊ XÁC NHẬN: BD ∈ {HW, FW}. Dùng cho chất lượng sản phẩm.
     Tầng 3 — VÉ KHÔNG PHẢI LỖI   : hạ tầng · khách quan · không tồn lỗi · chưa PL.

   Cách đếm cũ gộp "Không tồn lỗi" và "Chưa phân loại" vào tử số lỗi, nên M7 thổi
   phồng x1,87 (EVCS: 8.942 so với 4.789 thật) và x2,31 (BSS: 11.100 so với 4.803).
   Cả hai cách đều được giữ để đối chiếu — xem `tiers().legacy`.
   ============================================================================ */
(function (global) {
'use strict';

var R = null;      // { F, E, SEL, DAY, LIMH, ix } lấy từ AGG.raw()
var A = null;      // window.AGG

/* Nhóm lý do disclaim. ĐÂY LÀ LUẬT NGHIỆP VỤ MỚI, không có bên build.py.
   Chỉ liệt kê những lý do được XẾP NHÓM; lý do lạ (thêm mới bên classify.py mà
   quên khai ở đây) rơi vào 'other' và được đếm riêng trong `unmapped` để hiện lên
   mặt trang — không bao giờ biến mất im lặng. */
var BE_GROUP = {
  'Hạ tầng điện/mạng internet': 'infra',
  'Tắt nguồn/ngắt CB':          'infra',
  'Lỗi thao tác người dùng':      'ext',
  'Móp, vỡ, trày xước, đâm đụng': 'ext',
  'Trùng lặp/sai thông tin':      'ext',
  'Chưa lắp đặt/nghiệm thu':      'ext',
  'Nhả nút dừng khẩn cấp':        'ext',
  'Không phát hiện lỗi':          'ext',
  'Vệ sinh/bảo dưỡng':          'maint',
  'Lý do khác':                 'other'      // giá trị hợp lệ của classify.py, KHÔNG phải lý do lạ
};
var GROUP_LABEL = {
  infra: 'Hạ tầng điện / mạng',
  ext:   'Khách quan bên ngoài',
  maint: 'Vệ sinh / bảo dưỡng',
  other: 'Disclaim — lý do khác'
};

/* Mã lỗi có tỉ lệ "không tồn lỗi" vượt ngưỡng này thì gắn cờ nghi ngờ cảnh báo giả:
   KTV ra tận nơi, kiểm tra thiết bị, không thấy gì và không thay gì. Đó là bài toán
   ngưỡng cảnh báo của VOMS/FW, không phải bài toán phần cứng của CSE. */
var NOISE_KTL = 0.40;
var NOISE_MIN_QTY = 30;      // dưới ngưỡng này tỉ lệ không đủ tin để gắn cờ

var CLS_FAULT = ['HW', 'FW'];
var KTL = 'Không tồn lỗi';
var UNDEF = 'Chưa phân loại';
var DISCLAIM = 'Disclaim';

function init() {
  A = global.AGG;
  if (!A) throw new Error('scope.js phải nạp SAU agg.js');
  R = A.raw();
  return API;
}
function refresh() { R = A.raw(); return API; }      // SEL đổi sau mỗi select()

function rows(seg, sel) { return A.rowsOf(seg, sel || R.SEL); }
function lab(col, i) { return R.F.dicts[col][R.F.cols[col][i]]; }
function div(a, b) { return b ? a / b : 0; }

/* ---- Tầng chỉ số ------------------------------------------------------- */
/* Trả về đủ cả hai cách đếm để trang bày song song được, và để người đọc tự thấy
   khoảng cách giữa "vé không phải Disclaim" và "lỗi thiết bị xác nhận". */
function tiers(seg, sel) {
  var rs = rows(seg, sel);
  var bd = R.F.cols.BD, be = R.F.cols.BE;
  var dBD = R.F.dicts.BD, dBE = R.F.dicts.BE;
  var t = { total: rs.length, hw: 0, fw: 0, ktl: 0, undef: 0,
            infra: 0, ext: 0, maint: 0, other: 0, unmapped: {} };
  for (var k = 0; k < rs.length; k++) {
    var i = rs[k], c = dBD[bd[i]];
    if (c === 'HW') t.hw++;
    else if (c === 'FW') t.fw++;
    else if (c === KTL) t.ktl++;
    else if (c === UNDEF) t.undef++;
    else if (c === DISCLAIM) {
      var reason = dBE[be[i]] || '';
      var g = BE_GROUP[reason];
      if (g) t[g]++;
      else {
        t.other++;
        /* Lý do chưa khai trong BE_GROUP: đếm riêng để trang nói ra được, thay vì
           lặng lẽ gộp vào 'lý do khác' và không ai biết có nhóm mới. */
        if (reason) t.unmapped[reason] = (t.unmapped[reason] || 0) + 1;
      }
    }
  }
  t.fault = t.hw + t.fw;                       // TẦNG 2
  t.notFault = t.ktl + t.infra + t.ext + t.maint + t.other;
  t.legacy = t.total - (t.infra + t.ext + t.maint + t.other);   // cách đếm CŨ
  t.inflation = div(t.legacy, t.fault);        // cũ / mới
  t.shareFault = div(t.fault, t.total);
  t.shareNotFault = div(t.notFault, t.total);
  t.shareUndef = div(t.undef, t.total);
  return t;
}

/* Cơ cấu vé không phải lỗi, đã xếp nhóm, kèm chi tiết từng lý do BE để không ai
   phải tin nhóm mà không xem được số gốc. */
function notFaultBreakdown(seg, sel) {
  var rs = rows(seg, sel), bd = R.F.cols.BD, be = R.F.cols.BE;
  var dBD = R.F.dicts.BD, dBE = R.F.dicts.BE;
  var acc = Object.create(null), n = 0;
  for (var k = 0; k < rs.length; k++) {
    var i = rs[k], c = dBD[bd[i]], key, grp;
    if (c === KTL) { key = 'Không tồn lỗi khi tới nơi'; grp = 'ktl'; }
    else if (c === DISCLAIM) { key = dBE[be[i]] || 'Không ghi lý do'; grp = BE_GROUP[dBE[be[i]]] || 'other'; }
    else continue;
    var a = acc[key] || (acc[key] = { name: key, group: grp, qty: 0 });
    a.qty++; n++;
  }
  return Object.keys(acc).map(function (k) {
    var a = acc[k];
    a.share = div(a.qty, n);
    a.groupLabel = a.group === 'ktl' ? 'Không tồn lỗi' : GROUP_LABEL[a.group];
    return a;
  }).sort(function (x, y) { return y.qty - x.qty || (x.name < y.name ? -1 : 1); });
}

/* ---- Top mã lỗi: xếp hạng theo LỖI THẬT, không theo số vé ---------------- */
function topCodes(seg, n, sel) {
  n = n || 12;
  var rs = rows(seg, sel), code = R.F.cols.code, bd = R.F.cols.BD, at = R.F.cols.AT;
  var dCode = R.F.dicts.code, dBD = R.F.dicts.BD, dAT = R.F.dicts.AT;
  var acc = Object.create(null);
  for (var k = 0; k < rs.length; k++) {
    var i = rs[k], c = dCode[code[i]];
    if (!c) continue;                       // '----' / rỗng: đếm riêng ở dataGaps()
    var a = acc[c] || (acc[c] = { code: c, qty: 0, hw: 0, fw: 0, ktl: 0, dis: 0,
                                  undef: 0, models: Object.create(null) });
    a.qty++;
    var cls = dBD[bd[i]];
    if (cls === 'HW') a.hw++;
    else if (cls === 'FW') a.fw++;
    else if (cls === KTL) a.ktl++;
    else if (cls === DISCLAIM) a.dis++;
    else a.undef++;
    var m = dAT[at[i]];
    if (m) a.models[m] = (a.models[m] || 0) + 1;
  }
  var all = Object.keys(acc).map(function (k) {
    var a = acc[k];
    a.fault = a.hw + a.fw;
    a.pctFault = div(a.fault, a.qty);
    a.pctKtl = div(a.ktl, a.qty);
    a.pctDis = div(a.dis, a.qty);
    a.noise = a.qty >= NOISE_MIN_QTY && a.pctKtl >= NOISE_KTL;
    a.topModel = Object.keys(a.models).sort(function (x, y) {
      return a.models[y] - a.models[x] || (x < y ? -1 : 1); })[0] || '';
    return a;
  });
  /* Hai bảng xếp hạng trên cùng một tập: hạng theo vé để đối chiếu với cách đọc cũ,
     hạng theo lỗi thật là cái dùng để ra quyết định. */
  var byQty = all.slice().sort(function (x, y) { return y.qty - x.qty || (x.code < y.code ? -1 : 1); });
  var byFault = all.slice().sort(function (x, y) { return y.fault - x.fault || (x.code < y.code ? -1 : 1); });
  byQty.forEach(function (a, ix) { a.rankQty = ix + 1; });
  byFault.forEach(function (a, ix) { a.rankFault = ix + 1; });
  return { byQty: byQty.slice(0, n), byFault: byFault.slice(0, n), all: all };
}

/* ---- Thiết bị tái phát -------------------------------------------------- */
/* Câu hỏi nghiệp vụ: "những đầu trụ đấy có vấn đề gì không". Đếm theo LỖI THẬT,
   vì một trụ bị mở cửa báo động 10 lần không phải một trụ hỏng. */
function repeatDevices(seg, minN, sel) {
  minN = minN || 3;
  var rs = rows(seg, sel);
  var cp = R.F.cols.cpid, bd = R.F.cols.BD, code = R.F.cols.code,
      at = R.F.cols.AT, pv = R.F.cols.prov, asp = R.F.cols.asp;
  var dCp = R.F.dicts.cpid, dBD = R.F.dicts.BD, dCode = R.F.dicts.code,
      dAT = R.F.dicts.AT, dAsp = R.F.dicts.asp;
  var acc = Object.create(null), faultTotal = 0;
  for (var k = 0; k < rs.length; k++) {
    var i = rs[k], id = dCp[cp[i]];
    if (!id) continue;
    var cls = dBD[bd[i]], isFault = cls === 'HW' || cls === 'FW';
    var a = acc[id] || (acc[id] = { cpid: id, total: 0, fault: 0, hw: 0,
                                    codes: Object.create(null), model: '', prov: '', asp: '' });
    a.total++;
    if (isFault) {
      a.fault++; faultTotal++;
      if (cls === 'HW') a.hw++;
      var c = dCode[code[i]];
      if (c) a.codes[c] = (a.codes[c] || 0) + 1;
    }
    if (!a.model) a.model = dAT[at[i]] || '';
    if (!a.prov) a.prov = A.provName(R.F.dicts.prov[pv[i]]) || '';
    if (!a.asp) a.asp = dAsp[asp[i]] || '';
  }
  var list = Object.keys(acc).map(function (k) { return acc[k]; })
    .filter(function (a) { return a.fault > 0; });
  list.forEach(function (a) {
    a.codeList = Object.keys(a.codes).sort(function (x, y) {
      return a.codes[y] - a.codes[x] || (x < y ? -1 : 1); })
      .map(function (c) { return c + '×' + a.codes[c]; });
    /* Cùng một mã lỗi lặp lại trên cùng thiết bị = sửa chưa dứt điểm. Đây là tín hiệu
       khác hẳn với "trụ hỏng nhiều thứ", nên tách cờ riêng. */
    a.sameCode = Object.keys(a.codes).some(function (c) { return a.codes[c] >= 2; });
  });
  list.sort(function (x, y) { return y.fault - x.fault || y.total - x.total || (x.cpid < y.cpid ? -1 : 1); });

  var dist = [2, 3, 5, 10].map(function (m) {
    var d = list.filter(function (a) { return a.fault >= m; });
    var t = d.reduce(function (s, a) { return s + a.fault; }, 0);
    return { min: m, devices: d.length, tickets: t, share: div(t, faultTotal) };
  });
  return { list: list, dist: dist, faultTotal: faultTotal,
           devices: list.length, repeat: list.filter(function (a) { return a.fault >= minN; }) };
}

/* ---- Tỉ lệ lỗi theo model, đếm bằng LỖI THẬT ---------------------------- */
/* AGG.fail() giữ nguyên công thức cũ (BD != Disclaim) vì verify_agg.js khóa nó.
   Hàm này là bản song song: cùng hình dạng trả về, chỉ đổi tử số sang HW+FW để
   trang bày được hai cách đếm cạnh nhau.
   ⚠ `fleet` là số thiết bị ĐÓNG BĂNG ở W29 — mẫu số tĩnh, không theo khoảng ngày.
   Cột `failed` (số thiết bị khác nhau có lỗi) không cần fleet nên đáng tin hơn. */
function failByModel(models, fleet, sel) {
  var rows = sel || R.SEL, out = [], tS = 0, tF = 0, tT = 0;
  var at = R.F.cols.AT, bd = R.F.cols.BD, cp = R.F.cols.cpid;
  var dBD = R.F.dicts.BD, dAT = R.F.dicts.AT, dCp = R.F.dicts.cpid;
  models.forEach(function (mdl) {
    var seen = Object.create(null), n = 0, dev = 0;
    for (var k = 0; k < rows.length; k++) {
      var i = rows[k];
      if (dAT[at[i]] !== mdl) continue;
      var c = dBD[bd[i]];
      if (c !== 'HW' && c !== 'FW') continue;
      n++;
      var id = dCp[cp[i]];
      if (id && !seen[id]) { seen[id] = 1; dev++; }
    }
    var on = (fleet && fleet[mdl]) || 0;
    out.push({ model: mdl, onService: on, failed: dev, failRate: div(dev, on),
               tickets: n, freq: div(n, dev) });
    tS += on; tF += dev; tT += n;
  });
  out.push({ model: 'Total', onService: tS, failed: tF, failRate: div(tF, tS),
             tickets: tT, freq: div(tT, tF) });
  return out;
}

/* ---- SLA cắt theo DÒNG TRỤ (cột AT) ------------------------------------- */
/* Bảng SLA của build.py/agg.js chỉ cắt theo trạng thái ticket, nên "Kern chậm hơn AC"
   hay "BSS-12 quá hạn gấp đôi BSS-06" không đọc được ở đâu cả. Đây là ĐỊNH NGHĨA MỚI
   (build.py chưa từng tính) nên nằm ở scope.js — xem đầu file.

   Hai tỉ lệ khác nhau, cố tình bày cạnh nhau, đừng gộp:
     `rate`    = quá hạn / VÉ      — đo khối lượng việc trễ.
     `devRate` = thiết bị từng bị quá hạn / thiết bị từng có vé — đo ĐỘ PHỦ: một trụ
                 hỏng đi hỏng lại 10 lần chỉ là 1 thiết bị, nên `rate` cao mà `devRate`
                 thấp nghĩa là trễ dồn vào vài trụ, không phải cả dòng trụ có vấn đề.

   Chấm qua A.hasVerdict/A.isOn, KHÔNG đọc F.cols.ovdf: ở chế độ h48 vé chưa có
   solution phải rơi khỏi mẫu số y như bảng SLA chính, nếu không hai bảng lệch nhau.
   Overdue = total − ontime (giống build.sla_table), không dùng isOvd: vé có cờ SLA
   rỗng vẫn phải nằm ở một phía, và bảng gốc xếp chúng vào quá hạn.

   ⚠ Phải lặp lại phép LỌC TRẠNG THÁI của agg.statusList(), không chỉ hasVerdict():
   luật 'zone' cố tình chỉ đếm 13 trạng thái theo bố cục sheet Report gốc (bỏ
   'Pending for VOMS confirm'…). Bỏ qua phép lọc đó thì cùng một mục SLA, bảng theo
   trạng thái ra 7.572 vé còn bảng này ra 8.691 (đo trên W32 luồng API) — người đọc
   không có cách nào biết vì sao. Luật 'h48' không phụ thuộc trạng thái nên nhận hết,
   đúng như statusList() làm. */
function slaByModel(seg, sel) {
  var rs = rows(seg, sel);
  var at = R.F.cols.AT, dAT = R.F.dicts.AT, cp = R.F.cols.cpid, dCp = R.F.dicts.cpid;
  var st = R.F.cols.status, dSt = R.F.dicts.status, keepSt = null;
  if (A.slaRule() !== 'h48') {
    keepSt = Object.create(null);
    (R.E.slaStatuses || []).forEach(function (s) { keepSt[s] = 1; });
  }
  var acc = Object.create(null);
  for (var k = 0; k < rs.length; k++) {
    var i = rs[k];
    if (!A.hasVerdict(i)) continue;
    if (keepSt && !keepSt[dSt[st[i]]]) continue;
    var mdl = dAT[at[i]] || 'Khác';
    var a = acc[mdl] || (acc[mdl] = { model: mdl, total: 0, ontime: 0,
                                      _dev: Object.create(null) });
    a.total++;
    var on = A.isOn(i);
    if (on) a.ontime++;
    var id = dCp[cp[i]];
    if (id) {
      var d = a._dev[id];
      if (d === undefined) a._dev[id] = on ? 0 : 1;
      else if (!on) a._dev[id] = 1;
    }
  }
  var out = Object.keys(acc).map(function (m) {
    var a = acc[m], ids = Object.keys(a._dev), bad = 0;
    ids.forEach(function (id) { if (a._dev[id]) bad++; });
    return { model: a.model, total: a.total, ontime: a.ontime,
             overdue: a.total - a.ontime, rate: div(a.total - a.ontime, a.total),
             devices: ids.length, ovdDevices: bad, devRate: div(bad, ids.length) };
  });
  /* Xếp nhiều -> ít, bằng điểm theo tên — giống AGG.ranked()/build._ranked(). */
  out.sort(function (x, y) {
    return y.total - x.total || (x.model < y.model ? -1 : x.model > y.model ? 1 : 0);
  });
  var t = out.reduce(function (s, r) {
    s.total += r.total; s.ontime += r.ontime; s.overdue += r.overdue;
    s.devices += r.devices; s.ovdDevices += r.ovdDevices; return s;
  }, { model: 'Total', total: 0, ontime: 0, overdue: 0, devices: 0, ovdDevices: 0 });
  /* `devices` cộng dồn được vì một thiết bị chỉ thuộc MỘT dòng trụ. */
  t.rate = div(t.overdue, t.total);
  t.devRate = div(t.ovdDevices, t.devices);
  out.push(t);
  return out;
}

/* ---- Độ chín của kỳ ----------------------------------------------------- */
/* Vé phải có solution rồi mới phân loại được, nên kỳ vừa khép lại luôn "ít lỗi" một
   cách giả tạo. Đo trước, rồi mới cho phép so sánh. W32 từng có 48,5% vé chưa có
   solution và 49,5% chưa phân loại — không so được với W25 (0,3% / 3,8%). */
function maturity(seg, sel) {
  var rs = rows(seg, sel), ph = R.F.nums.proc_h, bd = R.F.cols.BD, dBD = R.F.dicts.BD;
  var withSol = 0, undef = 0;
  for (var k = 0; k < rs.length; k++) {
    var i = rs[k];
    if (ph[i] !== null && ph[i] !== undefined) withSol++;
    if (dBD[bd[i]] === UNDEF) undef++;
  }
  var share = div(withSol, rs.length);
  return { n: rs.length, withSol: withSol, share: share, undef: undef,
           undefShare: div(undef, rs.length),
           ripe: share >= 0.95,                       // đủ chín để so kỳ
           warn: rs.length > 0 && share < 0.95 };
}

/* ---- Chuỗi 3 tầng theo bucket (cho biểu đồ xu hướng) -------------------- */
function tierSeries(seg, bk, srcMode) {
  var out = { labels: bk.labels, load: [], fault: [], ktl: [], notFault: [],
              undef: [], ripe: [] };
  bk.list.forEach(function (b) {
    var sel = A.slice(b.from, b.to, srcMode || A.state().src);
    var t = tiers(seg, sel), m = maturity(seg, sel);
    out.load.push(t.total); out.fault.push(t.fault); out.ktl.push(t.ktl);
    out.notFault.push(t.notFault); out.undef.push(t.undef);
    out.ripe.push(+(m.share * 100).toFixed(1));
  });
  return out;
}

/* ---- Chất lượng dữ liệu đầu vào ---------------------------------------- */
/* Vé không có mã lỗi rơi khỏi MỌI phân tích top lỗi. Đây là chỉ số đội tự sửa được,
   khác với các chỉ số còn lại vốn phụ thuộc thiết bị. */
function dataGaps(seg, sel) {
  var rs = rows(seg, sel);
  var code = R.F.cols.code, rc = R.F.cols.RC, bd = R.F.cols.BD, rcs = R.F.cols.rc_src;
  var dCode = R.F.dicts.code, dRC = R.F.dicts.RC, dBD = R.F.dicts.BD, dRcs = R.F.dicts.rc_src;
  var noCode = 0, rcUndef = 0, bdUndef = 0, noText = 0;
  for (var k = 0; k < rs.length; k++) {
    var i = rs[k];
    if (!dCode[code[i]]) noCode++;
    if (dRC[rc[i]] === 'Chưa xác định') rcUndef++;
    if (dBD[bd[i]] === UNDEF) bdUndef++;
    if (!dRcs[rcs[i]]) noText++;
  }
  var n = rs.length;
  return { n: n, noCode: noCode, noCodeShare: div(noCode, n),
           rcUndef: rcUndef, rcUndefShare: div(rcUndef, n),
           bdUndef: bdUndef, bdUndefShare: div(bdUndef, n),
           noText: noText, noTextShare: div(noText, n) };
}

/* ---- Thẻ RCA theo MÃ LỖI ------------------------------------------------ */
/* Bổ sung 31/07/2026: "top lỗi từng model, phân loại theo mục 1, tìm nguyên nhân
   sâu xa, cho các thẻ card để bổ sung RCA".

   `topCodes()` trả lời "mã nào lớn nhất". Hàm này đi tiếp một tầng cho ĐÚNG những mã
   đó: mã này rơi vào model nào, nguyên nhân gì, KTV xử lý ra sao, xử lý xong có quay
   lại không. Đủ để một người ngồi viết RCA mà không phải mở CCTS.

   Ba tỉ lệ có MẪU SỐ KHÁC NHAU, đừng cộng chúng với nhau:
     - `models`/`sols` : mẫu số = mọi vé của mã lỗi trong khoảng ngày;
     - `rc`            : mẫu số = vé CÓ mô tả (`rc_src` khác rỗng). Tính trên cả vé
                         chưa có mô tả sẽ pha loãng mọi nhóm — cùng quy ước với
                         `alarm_rca` bên build.py;
     - `recur`         : mẫu số = vé đã đủ cửa sổ quan sát RECUR_DAYS (`recur` = -1 là
                         CHƯA đủ cửa sổ, phải loại chứ không được coi là "không lặp",
                         nếu không khoảng ngày gần đây luôn đẹp giả tạo).
*/
/* Ngưỡng mẫu tối thiểu để kết luận tái phát: ĐỌC TỪ `D.enums` (build.SOL_MIN_N), không
   chép cứng — chốt cứng một con số ở phía JS đúng là lỗi tái diễn của dự án này. */
function minEff() { return (R.E && R.E.solMinN) || 25; }

function medOf(a) {
  if (!a.length) return null;
  a = a.slice().sort(function (x, y) { return x - y; });
  var h = a.length >> 1;
  return +(a.length % 2 ? a[h] : (a[h - 1] + a[h]) / 2).toFixed(1);
}

function shareRows(acc, total) {
  return Object.keys(acc).map(function (k) {
    return { name: k, qty: acc[k], share: div(acc[k], total) };
  }).sort(function (x, y) { return y.qty - x.qty || (x.name < y.name ? -1 : 1); });
}

/* Gom theo mã lỗi trên MỘT tập dòng. Tách ra để chạy được hai lần: một lần trên
   khoảng ngày đang chọn, một lần trên toàn lịch sử (xem `errorCards`). */
function _accCodes(rs) {
  var code = R.F.cols.code, bd = R.F.cols.BD, rc = R.F.cols.RC, rcs = R.F.cols.rc_src,
      at = R.F.cols.AT, sl = R.F.cols.sol, cp = R.F.cols.cpid;
  var dCode = R.F.dicts.code, dBD = R.F.dicts.BD, dRC = R.F.dicts.RC,
      dRcs = R.F.dicts.rc_src, dAT = R.F.dicts.AT, dSol = R.F.dicts.sol,
      dCp = R.F.dicts.cpid;
  var fRec = R.F.flags.recur, fParts = R.F.flags.has_parts, nProc = R.F.nums.proc_h;
  var acc = Object.create(null);
  for (var k = 0; k < rs.length; k++) {
    var i = rs[k], c = dCode[code[i]];
    if (!c) continue;                       // vé không mã lỗi: đã đếm ở dataGaps()
    var a = acc[c] || (acc[c] = {
      code: c, qty: 0, hw: 0, fw: 0, ktl: 0, dis: 0, undef: 0,
      models: Object.create(null), rc: Object.create(null), withText: 0,
      sols: Object.create(null), devs: Object.create(null),
      effN: 0, recurN: 0, partsN: 0, proc: []
    });
    a.qty++;
    var cls = dBD[bd[i]];
    if (cls === 'HW') a.hw++;
    else if (cls === 'FW') a.fw++;
    else if (cls === KTL) a.ktl++;
    else if (cls === DISCLAIM) a.dis++;
    else a.undef++;

    var m = dAT[at[i]];
    if (m) a.models[m] = (a.models[m] || 0) + 1;
    if (dRcs[rcs[i]]) { a.withText++; var g = dRC[rc[i]]; if (g) a.rc[g] = (a.rc[g] || 0) + 1; }

    var s = dSol[sl[i]] || 'Chưa ghi cách xử lý';
    var so = a.sols[s] || (a.sols[s] = { qty: 0, effN: 0, recurN: 0, partsN: 0, proc: [] });
    so.qty++;
    if (fParts[i] === 1) { a.partsN++; so.partsN++; }
    if (fRec[i] === 1 || fRec[i] === 0) {     // -1 = chưa đủ cửa sổ quan sát
      a.effN++; so.effN++;
      if (fRec[i] === 1) { a.recurN++; so.recurN++; }
    }
    var p = nProc[i];
    if (p !== null && p !== undefined) { a.proc.push(p); so.proc.push(p); }
    var id = dCp[cp[i]];
    if (id) a.devs[id] = 1;
  }
  return acc;
}

/* Toàn bộ kho, MỌI nguồn — mẫu để đo tái phát và hiệu quả cách xử lý.
   Cache theo `seg` vì nó không phụ thuộc khoảng ngày đang chọn; quét 130k dòng mỗi
   lần đổi ngày là vô ích và làm trang giật. */
var _lifeCache = Object.create(null);
function _lifetime(seg) {
  var key = seg || 'all';
  if (!_lifeCache[key]) {
    /* `slice` nhận CHỈ SỐ ngày (không phải chuỗi ISO) và là nửa khoảng [lo, hi) —
       truyền chuỗi vào sẽ ra Int32Array RỖNG mà không báo lỗi gì. */
    _lifeCache[key] = _accCodes(rows(seg, A.slice(0, R.F.days.length, 'all')));
  }
  return _lifeCache[key];
}

function errorCards(seg, n, sel) {
  n = n || 10;
  var acc = _accCodes(rows(seg, sel));
  var life = _lifetime(seg);

  var list = Object.keys(acc).map(function (k) {
    var a = acc[k], L = life[k];
    a.fault = a.hw + a.fw;
    a.pctFault = div(a.fault, a.qty);
    a.pctKtl = div(a.ktl, a.qty);
    a.noise = a.qty >= NOISE_MIN_QTY && a.pctKtl >= NOISE_KTL;
    a.devices = Object.keys(a.devs).length;
    /* Tần suất lặp lại: bao nhiêu vé trên MỘT thiết bị dính mã này. >1 nghĩa là cùng
       một thiết bị bị lại — khác hẳn với "nhiều thiết bị mỗi cái một lần". */
    a.freq = div(a.qty, a.devices);
    a.med = medOf(a.proc);
    a.parts = div(a.partsN, a.qty);
    a.modelRows = shareRows(a.models, a.qty);
    a.topModel = a.modelRows.length ? a.modelRows[0].name : '';
    a.rcRows = shareRows(a.rc, a.withText);

    /* TÁI PHÁT LẤY TỪ TOÀN LỊCH SỬ, không từ khoảng ngày đang chọn.
       `recur` chỉ có giá trị khi vé đã đủ 30 ngày quan sát, mà kỳ báo cáo luôn là kỳ
       mới nhất — đo trên riêng khoảng đó thì effN = 0 và cột này VĨNH VIỄN trống.
       Đây đúng là cách `build.model_errors` tách `qty` (theo kỳ) khỏi `hist` (toàn
       kho); giữ hai mẫu số tách bạch và trang phải ghi rõ "toàn lịch sử". */
    a.histQty = L ? L.qty : 0;
    a.effN = L ? L.effN : 0;
    a.recur = (L && L.effN >= minEff()) ? div(L.recurN, L.effN) : null;

    var lifeSols = (L && L.sols) || {};
    a.solRows = Object.keys(a.sols).map(function (s) {
      var o = a.sols[s], lo = lifeSols[s];
      return { name: s, qty: o.qty, share: div(o.qty, a.qty),
               parts: div(o.partsN, o.qty), med: medOf(o.proc),
               effN: lo ? lo.effN : 0,
               recur: (lo && lo.effN >= minEff()) ? div(lo.recurN, lo.effN) : null };
    }).sort(function (x, y) { return y.qty - x.qty || (x.name < y.name ? -1 : 1); });
    delete a.models; delete a.rc; delete a.sols; delete a.devs; delete a.proc;
    return a;
  });
  /* Xếp theo LỖI THẬT, không theo số vé — mã báo giả nhiều sẽ leo lên đầu bảng nếu
     đếm vé, và đội sẽ đi viết RCA cho một vấn đề ngưỡng cảnh báo. */
  list.sort(function (x, y) { return y.fault - x.fault || y.qty - x.qty
                                     || (x.code < y.code ? -1 : 1); });
  return list.slice(0, n);
}

/* ---- Chất lượng ghi chép theo CSE -------------------------------------- */
function gapsByCse(sel) {
  var rs = sel || R.SEL, bf = R.F.cols.bf, code = R.F.cols.code, bd = R.F.cols.BD;
  var dBf = R.F.dicts.bf, dCode = R.F.dicts.code, dBD = R.F.dicts.BD;
  var acc = Object.create(null);
  for (var k = 0; k < rs.length; k++) {
    var i = rs[k], who = dBf[bf[i]];
    if (!who) continue;
    var a = acc[who] || (acc[who] = { cse: who, qty: 0, noCode: 0, undef: 0 });
    a.qty++;
    if (!dCode[code[i]]) a.noCode++;
    if (dBD[bd[i]] === UNDEF) a.undef++;
  }
  return Object.keys(acc).map(function (k) {
    var a = acc[k];
    a.noCodeShare = div(a.noCode, a.qty);
    a.undefShare = div(a.undef, a.qty);
    return a;
  }).sort(function (x, y) { return y.qty - x.qty || (x.cse < y.cse ? -1 : 1); });
}

var API = {
  init: init, refresh: refresh,
  tiers: tiers, notFaultBreakdown: notFaultBreakdown, tierSeries: tierSeries,
  topCodes: topCodes, repeatDevices: repeatDevices, maturity: maturity,
  failByModel: failByModel, slaByModel: slaByModel, errorCards: errorCards,
  dataGaps: dataGaps, gapsByCse: gapsByCse,
  GROUP_LABEL: GROUP_LABEL, BE_GROUP: BE_GROUP, NOISE_KTL: NOISE_KTL,
  CLS_FAULT: CLS_FAULT
};
global.SCOPE = API;
})(typeof window !== 'undefined' ? window : globalThis);
