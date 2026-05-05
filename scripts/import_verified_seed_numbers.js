#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const SEED_PATH = path.join(ROOT, 'data', 'seed_verified_public_numbers.csv');
const SCAM_PATH = path.join(ROOT, 'scam_numbers.json');
const TMP_PATH = path.join(ROOT, 'scam_numbers.tmp.json');
const BACKUP_DIR = path.join(ROOT, 'data', 'backups');
const BACKUP_PATH = path.join(BACKUP_DIR, 'scam_numbers.backup.json');
const REPORT_PATH = path.join(ROOT, 'data', 'seed_import_report.json');

const BAN_SHORT = new Set(['911', '089', '088', '070', '072']);
const BAN_TEN = new Set(['0000000000', '1111111111', '1234567890']);

function normalizeToMx(raw) {
  const input = String(raw || '').trim();
  if (!input) return null;
  const digits = input.replace(/\D/g, '');
  if (!digits) return null;
  if (BAN_SHORT.has(digits)) return null;
  if (digits.startsWith('01800') || digits.startsWith('01800')) return null;

  let local = null;
  if (digits.length === 10) {
    local = digits;
  } else if (digits.length === 12 && digits.startsWith('52')) {
    local = digits.slice(2);
  } else if (digits.length === 13 && digits.startsWith('521')) {
    local = digits.slice(3);
  }

  if (!local || !/^\d{10}$/.test(local)) return null;
  if (BAN_TEN.has(local)) return null;
  if (/^(\d)\1{9}$/.test(local)) return null;
  if (local.startsWith('800')) return null;

  return `+52${local}`;
}

function isBannedNormalized(number) {
  if (!/^\+52\d{10}$/.test(number)) return true;
  const local = number.slice(3);
  if (BAN_TEN.has(local)) return true;
  if (/^(\d)\1{9}$/.test(local)) return true;
  if (local.startsWith('800')) return true;
  return false;
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length === 0) return [];
  const header = lines[0].split(',').map((x) => x.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cols = lines[i].split(',');
    if (cols.length < header.length) continue;
    const row = {};
    for (let j = 0; j < header.length; j += 1) {
      row[header[j]] = (cols[j] || '').trim();
    }
    rows.push(row);
  }
  return rows;
}

function validateArray(data) {
  if (!Array.isArray(data)) throw new Error('scam_numbers.json must be an array');
  const seen = new Set();
  for (const row of data) {
    if (!row || typeof row !== 'object') throw new Error('row must be object');
    if (!/^\+52\d{10}$/.test(row.number || '')) throw new Error(`bad number format: ${row.number}`);
    if (isBannedNormalized(row.number)) throw new Error(`banned number: ${row.number}`);
    if (seen.has(row.number)) throw new Error(`duplicate number: ${row.number}`);
    seen.add(row.number);
  }
}

function main() {
  if (!fs.existsSync(SEED_PATH)) {
    console.log('Seed file not found; skipping import.');
    process.exit(0);
  }

  const rawOfficial = fs.readFileSync(SCAM_PATH, 'utf8');
  const officialData = JSON.parse(rawOfficial);
  validateArray(officialData);

  const csv = fs.readFileSync(SEED_PATH, 'utf8');
  const rows = parseCsv(csv);

  const skippedReasonsSummary = {};
  let validSeedRows = 0;
  let updatedExisting = 0;
  let addedThisRun = 0;

  function skip(reason) {
    skippedReasonsSummary[reason] = (skippedReasonsSummary[reason] || 0) + 1;
  }

  const byNumber = new Map();
  for (const row of officialData) byNumber.set(row.number, row);

  const seenSeed = new Set();

  for (const row of rows) {
    const conf = Number(row.confidence);
    if (!Number.isFinite(conf) || conf < 0.8) {
      skip('low_confidence');
      continue;
    }
    const normalized = normalizeToMx(row.number);
    if (!normalized) {
      skip('invalid_or_banned_number');
      continue;
    }
    if (seenSeed.has(normalized)) {
      skip('duplicate_in_seed');
      continue;
    }
    seenSeed.add(normalized);
    validSeedRows += 1;

    const now = new Date().toISOString();
    const existing = byNumber.get(normalized);
    if (existing) {
      let changed = false;
      if (!existing.sourceName && row.sourceName) {
        existing.sourceName = row.sourceName;
        changed = true;
      }
      if (!existing.sourceUrl && row.sourceUrl) {
        existing.sourceUrl = row.sourceUrl;
        changed = true;
      }
      if ((existing.confidence === undefined || existing.confidence === null) && Number.isFinite(conf)) {
        existing.confidence = conf;
        changed = true;
      }
      if (changed) {
        existing.updatedAt = now;
        updatedExisting += 1;
      }
      continue;
    }

    const newRow = {
      number: normalized,
      label: row.label || 'suspicious',
      country: 'MX',
      sourceName: row.sourceName || 'Verified Public Source',
      sourceUrl: row.sourceUrl || '',
      confidence: conf,
      updatedAt: now,
    };
    officialData.push(newRow);
    byNumber.set(normalized, newRow);
    addedThisRun += 1;
  }

  if (addedThisRun === 0 && updatedExisting === 0) {
    const report = {
      importedAt: new Date().toISOString(),
      seedRows: rows.length,
      validSeedRows,
      previousOfficialCount: byNumber.size,
      newOfficialCount: byNumber.size,
      addedThisRun,
      updatedExisting,
      skippedRows: rows.length - validSeedRows,
      skippedReasonsSummary,
    };
    fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
    console.log('No seed changes; exiting cleanly.');
    process.exit(0);
  }

  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  fs.copyFileSync(SCAM_PATH, BACKUP_PATH);

  fs.writeFileSync(TMP_PATH, `${JSON.stringify(officialData, null, 2)}\n`);

  try {
    const tmpParsed = JSON.parse(fs.readFileSync(TMP_PATH, 'utf8'));
    validateArray(tmpParsed);
    fs.copyFileSync(TMP_PATH, SCAM_PATH);
    fs.unlinkSync(TMP_PATH);
  } catch (error) {
    if (fs.existsSync(TMP_PATH)) fs.unlinkSync(TMP_PATH);
    console.error('Seed import validation failed:', error.message);
    process.exit(1);
  }

  const report = {
    importedAt: new Date().toISOString(),
    seedRows: rows.length,
    validSeedRows,
    previousOfficialCount: byNumber.size - addedThisRun,
    newOfficialCount: byNumber.size,
    addedThisRun,
    updatedExisting,
    skippedRows: rows.length - validSeedRows,
    skippedReasonsSummary,
  };
  fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);

  console.log(`Seed import complete. Added: ${addedThisRun}, updated existing: ${updatedExisting}.`);
}

main();
