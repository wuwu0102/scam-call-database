const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const scamPath = path.join(root, 'scam_numbers.json');
const outPath = path.join(root, 'data', 'mx_data_audit.json');

const PLACEHOLDERS = new Set(['0000000000','1111111111','1234567890','9999999999','5555555555','520000000000']);

function normalize(raw) {
  if (!raw) return '';
  let d = String(raw).replace(/[^\d+]/g, '').replace(/^\+/, '');
  d = d.replace(/\D/g, '');
  if (d.startsWith('521') && d.length >= 13) d = d.slice(3);
  else if (d.startsWith('52') && d.length >= 12) d = d.slice(2);
  else if (d.length > 10) d = d.slice(-10);
  return d;
}
function isValidMx(local) {
  if (!/^\d{10}$/.test(local)) return false;
  if (PLACEHOLDERS.has(local)) return false;
  if (/^(\d)\1{9}$/.test(local)) return false;
  return true;
}

const scam = JSON.parse(fs.readFileSync(scamPath, 'utf8'));
const seen = new Set();
let invalid = 0, valid = 0, dup = 0;
const sampleInvalidRecords = [];
const sourceBreakdown = {}, confidenceBreakdown = {}, statusBreakdown = {}, riskLevelBreakdown = {};
const warnings = [];

for (const r of scam) {
  const local = normalize(r.number);
  const norm = local ? `+52${local}` : '';
  const src = r.sourceName || r.source || 'unknown_public_signal';
  sourceBreakdown[src] = (sourceBreakdown[src] || 0) + 1;
  const confKey = String(r.confidence ?? 'unknown');
  confidenceBreakdown[confKey] = (confidenceBreakdown[confKey] || 0) + 1;
  const status = r.status || 'unknown';
  statusBreakdown[status] = (statusBreakdown[status] || 0) + 1;
  const risk = r.category || r.label || 'unknown';
  riskLevelBreakdown[risk] = (riskLevelBreakdown[risk] || 0) + 1;

  if (!isValidMx(local)) {
    invalid++;
    if (sampleInvalidRecords.length < 20) sampleInvalidRecords.push({ number: r.number || '', source: src, reason: 'invalid_mx_format_or_placeholder' });
    continue;
  }
  valid++;
  if (seen.has(norm)) dup++;
  seen.add(norm);
}

if (dup > 0) warnings.push(`duplicate_detected:${dup}`);
if (invalid > 0) warnings.push(`invalid_detected:${invalid}`);
const invalidRatio = scam.length ? invalid / scam.length : 0;
if (invalidRatio > 0.05) {
  warnings.push(`invalid_ratio_exceeded:${invalidRatio.toFixed(4)}`);
}

const payload = {
  generatedAt: new Date().toISOString(),
  totalRecords: scam.length,
  uniquePhoneNumbers: seen.size,
  duplicatePhoneNumbers: dup,
  invalidPhoneNumbers: invalid,
  validMxPhoneNumbers: valid,
  sourceBreakdown,
  confidenceBreakdown,
  statusBreakdown,
  riskLevelBreakdown,
  sampleInvalidRecords,
  warnings,
};

fs.writeFileSync(outPath, JSON.stringify(payload, null, 2) + '\n');
console.log(`mx audit generated: total=${payload.totalRecords} invalid=${invalid} dup=${dup}`);
if (invalidRatio > 0.05) {
  console.error(`invalid ratio too high: ${invalidRatio}`);
  process.exit(1);
}
