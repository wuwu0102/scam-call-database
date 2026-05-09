const fs = require('fs');
const path = require('path');

const input = path.join(__dirname, '..', 'data', 'collected_mexico_numbers.json');
const out = path.join(__dirname, '..', 'data', 'collected_mexico_numbers.json');
const allowed = ['sat', 'condusef', 'telefonospam', 'official'];

const rows = fs.existsSync(input) ? JSON.parse(fs.readFileSync(input, 'utf8')) : [];
const map = new Map();
for (const r of rows) {
  const src = String((r.sourceName || r.source || '')).toLowerCase();
  if (!allowed.some((k) => src.includes(k))) continue;
  const n = String(r.normalizedNumber || r.number || '').replace(/\D/g, '').slice(-10);
  if (!/^\d{10}$/.test(n)) continue;
  if (/^(911|089|088|070|072|800|01800)/.test(n)) continue;
  if (!map.has(n)) map.set(n, { ...r, normalizedNumber: n, number: n });
}

const outRows = Array.from(map.values());
fs.writeFileSync(out, JSON.stringify(outRows, null, 2) + '\n');
console.log(`Collected ${outRows.length} Mexico numbers from official/community-safe local sources.`);
