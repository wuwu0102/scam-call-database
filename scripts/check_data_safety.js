const fs = require('fs');
const path = require('path');
const { BLOCKED_LOCAL_SOURCES, normalizeMXNumber, isInvalidNumber } = require('./data_rules');
const files = ['data/collected_mexico_numbers.json','data/mexico_seed_phone_numbers.json','scam_numbers.json','data/ios_numbers.json'];
let fatal = false;
const read = (p) => {
  const full = path.join(__dirname, '..', p);
  if (!fs.existsSync(full)) return [];
  const j = JSON.parse(fs.readFileSync(full, 'utf8'));
  return Array.isArray(j) ? j : (Array.isArray(j.records) ? j.records : []);
};
const collected = read(files[0]);
if (collected.length === 0) { console.error('FATAL: collected cannot be empty'); fatal = true; }
for (const r of collected) {
  const sourceUrl = String(r.sourceUrl || '');
  const tag = r.tag;
  if (BLOCKED_LOCAL_SOURCES.has(sourceUrl)) { console.error(`FATAL: blocked local source ${sourceUrl}`); fatal = true; }
  if (typeof tag === 'object') { console.error('FATAL: tag object found'); fatal = true; }
  if (['safe','unknown'].includes(String(tag || '').toLowerCase())) { console.error(`FATAL: invalid tag ${tag}`); fatal = true; }
  const n = normalizeMXNumber(r.normalizedNumber || r.number || '');
  if (isInvalidNumber(n)) { console.error(`FATAL: invalid number ${n}`); fatal = true; }
}
for (const p of files.slice(1)) {
  for (const r of read(p)) {
    const n = normalizeMXNumber(r.normalizedNumber || r.number || r.phone || '');
    if (n && isInvalidNumber(n)) console.warn(`WARN ${p}: suspicious number ${n}`);
  }
}
if (fatal) process.exit(1);
console.log('Data safety checks passed');
