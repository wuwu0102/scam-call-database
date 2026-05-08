#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const SCAM_PATH = path.join(ROOT, 'scam_numbers.json');
const IOS_PATH = path.join(ROOT, 'data', 'ios_numbers.json');
const BACKUP_PATH = path.join(ROOT, 'data', 'backups', 'scam_numbers.backup.json');
const COLLECTION_REPORT = path.join(ROOT, 'data', 'collection_report.json');
const BANNED_SHORT = new Set(['911', '089', '088', '070', '072']);
const MAX_PROMOTE = 800;

function readJson(file, required = true) {
  if (!fs.existsSync(file)) {
    if (required) throw new Error(`${file} missing`);
    return null;
  }
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function isBannedNumber(number) {
  const n = String(number || '');
  return BANNED_SHORT.has(n.slice(3, 6)) || n.startsWith('+52800') || n.startsWith('+5201800');
}

const scam = readJson(SCAM_PATH, true);
if (!Array.isArray(scam)) throw new Error('scam_numbers.json must be array');
const seen = new Set();
for (const row of scam) {
  const n = row && row.number;
  if (!/^\+52\d{10}$/.test(String(n || ''))) throw new Error(`invalid number format: ${n}`);
  if (seen.has(n)) throw new Error(`duplicate number: ${n}`);
  if (isBannedNumber(n)) throw new Error(`banned number: ${n}`);
  seen.add(n);
}

const backup = readJson(BACKUP_PATH, true);
if (!Array.isArray(backup)) throw new Error('backup scam_numbers.backup.json must be array');
if (scam.length < backup.length) throw new Error(`scam_numbers.json shrank: ${scam.length} < ${backup.length}`);

const backupSet = new Set(backup.map((r) => r && r.number).filter(Boolean));
for (const row of scam) {
  if (!row || !row.number || backupSet.has(row.number)) continue;
  for (const requiredField of ['sourceName', 'sourceUrl', 'sourceType', 'confidence', 'note', 'updatedAt']) {
    if (!(requiredField in row)) throw new Error(`missing source field ${requiredField} for new number ${row.number}`);
  }
}

const ios = readJson(IOS_PATH, true);
if (!Array.isArray(ios)) throw new Error('data/ios_numbers.json must be array');
const backupIosCount = Number(process.env.IOS_BASELINE_COUNT || 0);
if (backupIosCount > 0 && ios.length < backupIosCount) throw new Error(`iOS export shrank: ${ios.length} < ${backupIosCount}`);

const report = readJson(COLLECTION_REPORT, false);
if (report && Number(report.promotedThisRun || 0) > MAX_PROMOTE) {
  throw new Error(`promoted too many in one run: ${report.promotedThisRun} > ${MAX_PROMOTE}`);
}
if (scam.length - backup.length > MAX_PROMOTE) throw new Error(`added too many in one run: ${scam.length - backup.length} > ${MAX_PROMOTE}`);

console.log(`Database safety check OK (scam: ${scam.length}, iOS: ${ios.length}, delta: ${scam.length - backup.length})`);
