const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CSV = path.join(ROOT, 'data', 'community_seed_numbers.csv');
const SCAM = path.join(ROOT, 'scam_numbers.json');
const IOS = path.join(ROOT, 'data', 'ios_numbers.json');
const MAX_ADD = 5000;
const MAX_SCAM = 6000;

function parseCsvLine(line) {
  return line.split(',').map((x) => x.trim());
}
function isServiceText(v) { return /(service|hotline|customer\s*support|contact|contacto)/i.test(String(v || '')); }
function normalize(number) { const d = String(number || '').replace(/\D/g, ''); return d.length === 10 ? `+52${d}` : null; }
function isBlocked(n) { return /^\+52(911|089|088|070|072)/.test(n) || /^\+52800/.test(n) || /^\+5201800/.test(n); }

function run() {
  const scam = JSON.parse(fs.readFileSync(SCAM, 'utf8'));
  const ios = JSON.parse(fs.readFileSync(IOS, 'utf8'));
  const existingScam = new Set(scam.map((r) => r.number));
  const existingIos = new Set(ios.map((r) => String(r.number)));

  const lines = fs.readFileSync(CSV, 'utf8').split(/\r?\n/).filter(Boolean);
  const header = parseCsvLine(lines[0]);
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));

  let added = 0;
  const now = new Date().toISOString();
  for (let i = 1; i < lines.length; i++) {
    if (added >= MAX_ADD) break;
    const cols = parseCsvLine(lines[i]);
    const sourceName = cols[idx.sourceName] || '';
    const sourceUrl = cols[idx.sourceUrl] || '';
    const sourceType = cols[idx.sourceType] || '';
    const confidence = Number(cols[idx.confidence] || 0);
    const tag = cols[idx.tag] || 'Señal comunitaria reportada';
    const note = cols[idx.note] || '';
    const number = normalize(cols[idx.number]);

    if (!number || isBlocked(number)) continue;
    if (!sourceName || !sourceUrl || !sourceType || !confidence) continue;
    if (isServiceText(sourceName) || isServiceText(sourceUrl) || isServiceText(note)) continue;
    if (['community_report', 'public_report'].includes(sourceType) && !/no confirmación legal|riesgo potencial/i.test(note)) continue;
    if (existingScam.has(number)) continue;

    scam.push({ number, label: 'Número sospechoso', tag, country: 'MX', sourceName, sourceUrl, sourceType, confidence, note, updatedAt: now, lastUpdated: now });
    existingScam.add(number);
    const n10 = number.replace(/^\+52/, '');
    if (!existingIos.has(n10)) {
      ios.push({ number: n10, label: 'Número sospechoso', updatedAt: now.slice(0, 10) });
      existingIos.add(n10);
    }
    added++;
  }

  if (scam.length > MAX_SCAM) throw new Error(`scam_numbers.json too large: ${scam.length} > ${MAX_SCAM}`);

  fs.writeFileSync(SCAM, JSON.stringify(scam, null, 2) + '\n');
  fs.writeFileSync(IOS, JSON.stringify(ios, null, 2) + '\n');
  console.log(`Imported community seed numbers: ${added}`);
}

run();
