#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = process.cwd();
const SCAM_PATH = path.join(ROOT, 'scam_numbers.json');
const IOS_PATH = path.join(ROOT, 'data', 'ios_numbers.json');
const BACKUP_PATH = path.join(ROOT, 'data', 'backups', 'scam_numbers.backup.json');
const COLLECTION_REPORT = path.join(ROOT, 'data', 'collection_report.json');
const MAX_PROMOTE = 5000;
const MAX_SCAM = 6000;
const BANNED_PREFIXES = ['+52911', '+52089', '+52088', '+52070', '+52072', '+52800', '+5201800'];

function readJson(file, required = true) { if (!fs.existsSync(file)) { if (required) throw new Error(`${file} missing`); return null; } return JSON.parse(fs.readFileSync(file, 'utf8')); }
function isBannedNumber(number) { const n = String(number || ''); return BANNED_PREFIXES.some((p) => n.startsWith(p)); }
function hasServiceText(v) { return /(service|hotline|customer\s*support|contacto|oficina|conmutador|denuncia\s*hotline|emergencia)/i.test(String(v || '')); }

const scam = readJson(SCAM_PATH, true);
const ios = readJson(IOS_PATH, true);
const backup = readJson(BACKUP_PATH, true);
const report = readJson(COLLECTION_REPORT, false) || {};
if (!Array.isArray(scam) || !Array.isArray(ios) || !Array.isArray(backup)) throw new Error('db files must be arrays');
if (scam.length < backup.length) throw new Error(`scam_numbers.json shrank: ${scam.length} < ${backup.length}`);
if (ios.length < Number(process.env.IOS_BASELINE_COUNT || 0)) throw new Error(`iOS export shrank: ${ios.length} < ${process.env.IOS_BASELINE_COUNT}`);

const backupSet = new Set(backup.map((r) => r && r.number).filter(Boolean));
const seen = new Set();
let added = 0;
for (const row of scam) {
  const n = row?.number;
  if (!/^\+52\d{10}$/.test(String(n || ''))) throw new Error(`invalid number format: ${n}`);
  if (seen.has(n)) throw new Error(`duplicate number: ${n}`);
  if (isBannedNumber(n) || hasServiceText(row?.sourceName) || hasServiceText(row?.sourceUrl) || hasServiceText(row?.tag) || hasServiceText(row?.note)) throw new Error(`banned service/hotline row: ${n}`);
  seen.add(n);
  if (!backupSet.has(n)) {
    added++;
    for (const field of ['sourceName', 'sourceUrl', 'sourceType', 'confidence']) if (!row[field]) throw new Error(`new record missing ${field}: ${n}`);
    if (['community_report', 'public_report'].includes(String(row.sourceType || ''))) {
      const note = String(row.note || '');
      if (!/no confirmación legal|riesgo potencial/i.test(note)) throw new Error(`community/public note missing legal-risk disclaimer: ${n}`);
    }
  }
}
if (added > MAX_PROMOTE) throw new Error(`added too many in one run: ${added} > ${MAX_PROMOTE}`);
if (scam.length > MAX_SCAM) throw new Error(`scam_numbers.json too large: ${scam.length} > ${MAX_SCAM}`);
if (scam.length < 5000) console.warn(`warning: scam_numbers.json below 5000 (${scam.length})`);

let iosAddedLines = 0;
try {
  const diff = execSync('git diff --numstat -- data/ios_numbers.json', { encoding: 'utf8' }).trim();
  if (diff) iosAddedLines = Number(diff.split(/\s+/)[0] || 0);
} catch {}
const iosLineLimit = added * 3 + 300;
const minimalDiffOk = iosAddedLines <= iosLineLimit;
if (!minimalDiffOk) throw new Error(`data/ios_numbers.json rewrite too large: +${iosAddedLines} > limit ${iosLineLimit}`);

const promotedTotal = Number(report.promotedTotal || report.promotedThisRun || 0);
const promotedCommunity = Number(report.promotedTrustedCommunity || 0);
if (promotedTotal > 0 && promotedCommunity / promotedTotal > 0.9) console.warn(`warning: community promotions exceed 90% (${promotedCommunity}/${promotedTotal})`);

report.minimalDiffOk = minimalDiffOk;
report.dataRewriteRisk = iosAddedLines > added * 2 + 200 ? 'medium' : 'low';
fs.writeFileSync(COLLECTION_REPORT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

console.log(`Database safety check OK (scam=${scam.length}, ios=${ios.length}, added=${added}, iosAddedLines=${iosAddedLines})`);
