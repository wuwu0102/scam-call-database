const fs = require('fs');
const path = require('path');
const BASELINE = 755;
const seedPath = path.join(__dirname, '..', 'data', 'mexico_seed_phone_numbers.json');
const collectedPath = path.join(__dirname, '..', 'data', 'collected_mexico_numbers.json');
const scamPath = path.join(__dirname, '..', 'scam_numbers.json');

const read=(p,d)=>fs.existsSync(p)?JSON.parse(fs.readFileSync(p,'utf8')):d;
const norm=(v)=>String(v||'').replace(/\D/g,'').slice(-10);

const seed = read(seedPath,[]);
const collected = read(collectedPath,[]);
const scam = read(scamPath,{version:'mvp-1',records:[]});
const map = new Map();

for (const r of [...(scam.records||[]), ...seed, ...collected]) {
  const n = norm(r.normalizedNumber||r.number||r.phone);
  if (!/^\d{10}$/.test(n)) continue;
  map.set(n, {
    phone: n,
    normalizedNumber: n,
    country: 'MX',
    label: r.label || 'suspicious',
    tag: r.tag || 'Número sospechoso',
    type: r.type || r.sourceType || 'community',
    sourceType: r.sourceType || r.type || 'community',
    confidence: r.confidence || 'low',
    source: r.source || r.sourceName || 'Unknown',
    sourceName: r.sourceName || r.source || 'Unknown',
    sourceUrl: r.sourceUrl || '',
    note: r.note || '',
    updatedAt: r.updatedAt || new Date().toISOString().slice(0,10)
  });
}

const merged = Array.from(map.values()).sort((a,b)=>a.normalizedNumber.localeCompare(b.normalizedNumber));
if (merged.length < BASELINE) {
  console.error(`Merged count ${merged.length} < baseline ${BASELINE}. Abort write.`);
  process.exit(1);
}
fs.writeFileSync(scamPath, JSON.stringify({version: scam.version||'mvp-1', records: merged}, null, 2)+'\n');
console.log(`Merged records: ${merged.length}`);
