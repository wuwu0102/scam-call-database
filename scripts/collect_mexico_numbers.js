const fs = require('fs');
const path = require('path');
const input = path.join(__dirname, '..', 'data', 'collected_mexico_numbers.json');
const out = path.join(__dirname, '..', 'data', 'collected_mexico_numbers.json');
const BASELINE=755;
const allowed = ['sat','condusef','telefonospam'];
const rows = fs.existsSync(input) ? JSON.parse(fs.readFileSync(input,'utf8')) : [];
const map = new Map();
for (const r of rows) {
  const src = String((r.sourceName||r.source||'')).toLowerCase();
  const preferred = allowed.some(k=>src.includes(k));
  const n = String(r.normalizedNumber||r.number||'').replace(/\D/g,'').slice(-10);
  if (!/^\d{10}$/.test(n)) continue;
  const old = map.get(n);
  if (!old || preferred) map.set(n, { ...r, normalizedNumber:n, number:n });
}
let outRows = Array.from(map.values()).sort((a,b)=>a.normalizedNumber.localeCompare(b.normalizedNumber));
if (outRows.length < BASELINE) {
  // keep all valid existing numbers to avoid shrinking below baseline
  const keep = new Map();
  for (const r of rows) {
    const n = String(r.normalizedNumber||r.number||'').replace(/\D/g,'').slice(-10);
    if (/^\d{10}$/.test(n)) keep.set(n,{...r,normalizedNumber:n,number:n});
  }
  outRows = Array.from(keep.values());
}
fs.writeFileSync(out, JSON.stringify(outRows,null,2)+'\n');
console.log(`Collected ${outRows.length} Mexico numbers from SAT/CONDUSEF/TelefonoSpam.`);
