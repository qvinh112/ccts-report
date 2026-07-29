/* Đối chiếu lớp đếm agg.js với các khối build.py đã nấu sẵn.
 *
 * Cách kiểm: chọn ĐÚNG khoảng ngày của tuần báo cáo (D.weekSpan[week]) rồi so từng
 * khối với bản *W tương ứng trong data_latest.js. Trùng khít = lớp đếm phía trang
 * hiểu dữ liệu giống hệt build.py; lệch = phải sửa trước khi đụng vào index.html.
 *
 * Chạy:  node verify_agg.js
 */
const fs = require('fs');
const path = require('path');

function loadConst(file, name) {
  const t = fs.readFileSync(path.join(__dirname, file), 'utf8');
  return JSON.parse(t.slice(t.indexOf('{', t.indexOf(name)), t.lastIndexOf('}') + 1));
}

const D = loadConst('data_latest.js', 'REPORT_DATA');
const FACTS = loadConst('facts.js', 'REPORT_FACTS');
global.window = global;
require('./agg.js');
const AGG = global.AGG.init(FACTS, D.enums);

const span = (D.weekSpan || {})[D.week];
if (!span) { console.error('Không có weekSpan cho', D.week); process.exit(1); }
console.log(`Tuần ${D.week} = ${span.from} → ${span.to}`);
const n = AGG.select(span.from, span.to, 'api');
console.log(`Lát cắt: ${n} ticket (luồng API)\n`);

let pass = 0, fail = 0;
function cmp(label, got, want) {
  const a = JSON.stringify(round(got)), b = JSON.stringify(round(want));
  if (a === b) { pass++; console.log(`  ✔ ${label}`); return; }
  fail++;
  console.log(`  ✘ ${label}`);
  console.log(`      agg : ${a.slice(0, 300)}`);
  console.log(`      build: ${b.slice(0, 300)}`);
}
/* build.py làm tròn số thực 6 chữ số khi ghi file (_trim_floats) -> so cùng độ chính xác */
function round(o) {
  if (typeof o === 'number') return Number.isInteger(o) ? o : Math.round(o * 1e6) / 1e6;
  if (Array.isArray(o)) return o.map(round);
  if (o && typeof o === 'object') {
    const r = {};
    Object.keys(o).forEach(k => { r[k] = round(o[k]); });
    return r;
  }
  return o;
}

const fleetE = {}, fleetB = {};
D.failEvcsM.forEach(r => { if (r.model !== 'Total') fleetE[r.model] = r.onService; });
D.failBssM.forEach(r => { if (r.model !== 'Total') fleetB[r.model] = r.onService; });
const totE = Object.values(fleetE).reduce((a, b) => a + b, 0);
const totB = Object.values(fleetB).reduce((a, b) => a + b, 0);

console.log('— Phân loại —');
const [clsE, clsEt] = AGG.classification('EVCS', totE);
cmp('clsEvcsW', clsE, D.clsEvcsW);
cmp('clsEvcsW_total', clsEt, D.clsEvcsW_total);
const [clsB, clsBt] = AGG.classification('BSS', totB);
cmp('clsBssW', clsB, D.clsBssW);
cmp('clsBssW_total', clsBt, D.clsBssW_total);

console.log('— Disclaim / nguồn nhãn / khối xám —');
cmp('disEvcsW', AGG.disclaim('EVCS'), D.disEvcsW);
cmp('disBssW', AGG.disclaim('BSS'), D.disBssW);
cmp('bdSrcEvcsW', AGG.bdSource('EVCS'), D.bdSrcEvcsW);
cmp('bdSrcBssW', AGG.bdSource('BSS'), D.bdSrcBssW);
cmp('undefEvcsW', AGG.undefBreakdown('EVCS'), D.undefEvcsW);
cmp('undefBssW', AGG.undefBreakdown('BSS'), D.undefBssW);

console.log('— Nguyên nhân —');
cmp('rcEvcsW', AGG.rootcause('EVCS'), D.rcEvcsW);
cmp('rcBssW', AGG.rootcause('BSS'), D.rcBssW);
cmp('rcCoverage.evcsW', AGG.rcCoverage('EVCS'), D.rcCoverage.evcsW);
cmp('rcCoverage.bssW', AGG.rcCoverage('BSS'), D.rcCoverage.bssW);
cmp('rcXclsEvcsW', AGG.rcCross('EVCS'), D.rcXclsEvcsW);
cmp('rcXclsBssW', AGG.rcCross('BSS'), D.rcXclsBssW);
cmp('alarmRcaEvcsW', AGG.alarmRca('EVCS'), D.alarmRcaEvcsW);
cmp('alarmRcaBssW', AGG.alarmRca('BSS'), D.alarmRcaBssW);

console.log('— Fail rate / SLA / Resource —');
cmp('failEvcsW', AGG.fail(D.enums.evcsModels, fleetE), D.failEvcsW);
cmp('failBssW', AGG.fail(D.enums.bssModels, fleetB), D.failBssW);
const slaE = AGG.slaTable('EVCS'), slaB = AGG.slaTable('BSS');
cmp('slaEvcsW', slaE, D.slaEvcsW);
cmp('slaBssW', slaB, D.slaBssW);
cmp('resEvcsW', AGG.resourceTable(slaE), D.resEvcsW);
cmp('resBssW', AGG.resourceTable(slaB), D.resBssW);

console.log('— Tình huống overdue —');
cmp('scenario', AGG.scenarioBreak(), D.scenario);

console.log(`\nKẾT QUẢ: ${pass} khớp / ${fail} lệch`);
process.exit(fail ? 1 : 0);
