const fs = require('fs');
const path = require('path');
const { normalizeMXNumber, isInvalidNumber, isHttpUrl } = require('./data_rules');
const root = path.join(__dirname, '..');
const read=(p,d)=>{const f=path.join(root,p); return fs.existsSync(f)?JSON.parse(fs.readFileSync(f,'utf8')):d;};
const now = read('data/collected_mexico_numbers.json', []);
const log = read('data/collector_run_log.json', {});
const prev = read('data/public_stats.json', {});
let fatal = false;
const prevCount = Number(prev.collectedCount || prev.totalSearchableCount || 0);
if (prevCount && now.length < prevCount) console.warn(`warning: collected dropped prev=${prevCount} now=${now.length}`);
if (now.length < 17) { console.error('FATAL: collected below 17'); fatal = true; }
if (Number(log.target || 0) === 1000 && now.length < 1000) console.warn('warning: below target 1000 (allowed)');
const test = new Set(['0000000000','1111111111','1234567890','5555555555','9999999999','2025550101','2025550102','2025550103','2025550104','2025550105']);
for (const r of now) {
  const n = normalizeMXNumber(r.normalizedNumber || r.number || '');
  if (!/^\d{10}$/.test(n) || isInvalidNumber(n) || test.has(n) || /^20\d{8}$/.test(n)) { console.error(`FATAL invalid number ${n}`); fatal = true; }
  if (['safe','unknown'].includes(String(r.tag || '').toLowerCase())) { console.error('FATAL invalid tag'); fatal = true; }
  if (typeof r.tag === 'object') { console.error('FATAL tag object'); fatal = true; }
  if (!isHttpUrl(String(r.sourceUrl || '')) || String(r.sourceUrl || '').startsWith('local://')) { console.error('FATAL invalid sourceUrl'); fatal = true; }
}
if (fatal) process.exit(1);
console.log('Data safety checks passed');
