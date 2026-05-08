#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const SCAM_PATH = path.join(ROOT, 'scam_numbers.json');
const PENDING_PATH = path.join(ROOT, 'data', 'pending_numbers.json');
const REPORT_PATH = path.join(ROOT, 'data', 'scrape_report.json');
const CATALOG_PATH = path.join(ROOT, 'data', 'source_catalog_mexico.json');

const PUBLIC_STATS_PATH = path.join(ROOT, 'data', 'public_stats.json');

const BACKUP_PATH = path.join(ROOT, 'data', 'backups', 'scam_numbers.backup.json');
const BANNED_SHORT = new Set(['911', '089', '088', '070', '072']);

function readJson(file, required = true) {
  if (!fs.existsSync(file)) {
    if (required) throw new Error(`${file} missing`);
    return null;
  }
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function isBanned(number) {
  return BANNED_SHORT.has(number.slice(3, 6)) || number.startsWith('+52800') || number.startsWith('+5201800');
}

const scam = readJson(SCAM_PATH, true);
if (!Array.isArray(scam)) throw new Error('scam_numbers.json must be array');
const seen = new Set();
for (const row of scam) {
  const n = row && row.number;
  if (!/^\+52\d{10}$/.test(String(n || ''))) throw new Error(`invalid number format: ${n}`);
  if (seen.has(n)) throw new Error(`duplicate number: ${n}`);
  if (isBanned(n)) throw new Error(`banned number: ${n}`);
  seen.add(n);
}
if (seen.size < 1000) throw new Error(`scam_numbers.json too small: ${seen.size} < 1000`);
if (fs.existsSync(BACKUP_PATH)) {
  const backup = readJson(BACKUP_PATH, false);
  if (Array.isArray(backup)) {
    const backupSize = backup.length;
    if (seen.size + 50 < backupSize) throw new Error(`scam_numbers.json shrank too much: ${seen.size} vs backup ${backupSize}`);
  }
}

readJson(PENDING_PATH, false);
readJson(REPORT_PATH, false);
const catalog = readJson(CATALOG_PATH, false);
if (catalog) {
  if (!Array.isArray(catalog)) throw new Error('source_catalog_mexico.json must be array');
  for (const s of catalog) {
    for (const key of ['name', 'url', 'type', 'confidence', 'mode', 'autoPromote', 'priority', 'region']) {
      if (!(key in s)) throw new Error(`source missing field ${key}`);
    }
  }
}

console.log('Database safety check OK');

const stats = readJson(PUBLIC_STATS_PATH, false);
if (stats) {
  if (typeof stats !== 'object' || Array.isArray(stats)) throw new Error('public_stats.json must be object');
  const officialUnique = seen.size;
  if (Number(stats.officialSuspiciousCount) !== officialUnique) throw new Error('officialSuspiciousCount mismatch');
  if (Number(stats.monitoredSignalsCount) < Number(stats.officialSuspiciousCount)) throw new Error('monitoredSignalsCount cannot be lower than officialSuspiciousCount');
  if (Number(stats.communitySignalCount) < 0) throw new Error('communitySignalCount cannot be negative');
  if (!stats.categoryBreakdown || typeof stats.categoryBreakdown !== 'object' || Array.isArray(stats.categoryBreakdown)) throw new Error('categoryBreakdown must be object');
}
