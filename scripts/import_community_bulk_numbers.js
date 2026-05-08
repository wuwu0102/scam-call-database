#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const CSV_PATH = path.join(ROOT, 'data', 'community_bulk_import_numbers.csv');
const PENDING_PATH = path.join(ROOT, 'data', 'pending_numbers.json');
const SCAM_PATH = path.join(ROOT, 'scam_numbers.json');
const REPORT_PATH = path.join(ROOT, 'data', 'community_bulk_import_report.json');

const CSV_HEADER = 'number,label,sourceName,sourceUrl,region,note,confidence';
const BANNED_SHORT = new Set(['911', '089', '088', '070', '072']);

function ensureCsvFile() {
  if (!fs.existsSync(CSV_PATH)) {
    fs.mkdirSync(path.dirname(CSV_PATH), { recursive: true });
    fs.writeFileSync(CSV_PATH, `${CSV_HEADER}\n`, 'utf8');
  }
}

function safeReadJsonArray(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return Array.isArray(parsed) ? parsed : [];
}

function parseCsvLine(line) {
  const parts = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      parts.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  parts.push(current.trim());
  return parts;
}

function parseCsv(content) {
  const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) return [];
  const header = parseCsvLine(lines[0]);
  const expected = CSV_HEADER.split(',');
  if (header.join(',') !== expected.join(',')) {
    throw new Error('Invalid CSV header for community bulk import');
  }
  return lines.slice(1).map((line, idx) => {
    const cols = parseCsvLine(line);
    const [number, label, sourceName, sourceUrl, region, note, confidence] = cols;
    return {
      row: idx + 2,
      number: number || '',
      label: label || '',
      sourceName: sourceName || '',
      sourceUrl: sourceUrl || '',
      region: region || '',
      note: note || '',
      confidence: confidence || ''
    };
  });
}

function normalizeMxNumber(raw) {
  const rawText = String(raw || '').trim();
  if (!rawText) return null;
  if (/^\d\1{9}$/.test(rawText.replace(/\D/g, '').slice(-10))) return null;

  const lowered = rawText.toLowerCase();
  if (lowered.includes('test') || lowered.includes('dummy')) return null;

  const compact = rawText.replace(/[\s\-()]/g, '');
  if (/^(\+52)?800/.test(compact) || /^01800/.test(compact) || /^01800/.test(rawText.replace(/\s+/g, ''))) {
    return null;
  }

  const digits = rawText.replace(/\D/g, '');
  if (BANNED_SHORT.has(digits)) return null;

  let local10 = '';
  if (digits.length === 10) {
    local10 = digits;
  } else if (digits.length === 12 && digits.startsWith('52')) {
    local10 = digits.slice(2);
  } else if (digits.length === 13 && digits.startsWith('521')) {
    local10 = digits.slice(3);
  } else if (digits.length === 11 && digits.startsWith('1')) {
    local10 = digits.slice(1);
  } else {
    return null;
  }

  if (!/^\d{10}$/.test(local10)) return null;
  if (/^(\d)\1{9}$/.test(local10)) return null;
  if (BANNED_SHORT.has(local10)) return null;
  if (local10.startsWith('800')) return null;

  return `+52${local10}`;
}

function sourceKey(sourceName, sourceUrl) {
  return `${String(sourceName || '').trim()}||${String(sourceUrl || '').trim()}`;
}

function mergeSources(existingSources, incoming) {
  const map = new Map();
  for (const src of existingSources || []) {
    map.set(sourceKey(src.sourceName, src.sourceUrl), src);
  }
  const key = sourceKey(incoming.sourceName, incoming.sourceUrl);
  map.set(key, {
    sourceName: incoming.sourceName,
    sourceType: 'community_report',
    sourceUrl: incoming.sourceUrl,
    confidence: incoming.confidence,
    mode: 'community_bulk_csv_import',
    collectedAt: incoming.collectedAt
  });
  return Array.from(map.values());
}

function computeConfidence(base, evidenceCount) {
  let final = base;
  if (evidenceCount >= 3) final += 0.2;
  else if (evidenceCount >= 2) final += 0.1;
  return Math.min(0.85, Number(final.toFixed(4)));
}

function run() {
  ensureCsvFile();
  const now = new Date().toISOString();
  const pending = safeReadJsonArray(PENDING_PATH);
  const scam = safeReadJsonArray(SCAM_PATH);
  const scamSet = new Set(scam.map((r) => r.number).filter(Boolean));

  const pendingMap = new Map();
  for (const item of pending) {
    if (item && item.number) pendingMap.set(item.number, item);
  }

  const csvContent = fs.readFileSync(CSV_PATH, 'utf8');
  const rows = parseCsv(csvContent);

  let validRows = 0;
  let addedToPending = 0;
  let updatedExistingPending = 0;
  const skippedReasons = [];
  const seenInCsv = new Set();

  for (const row of rows) {
    const normalized = normalizeMxNumber(row.number);
    if (!normalized) {
      skippedReasons.push('invalid_number');
      continue;
    }
    if (seenInCsv.has(normalized)) {
      skippedReasons.push('duplicate_in_csv');
      continue;
    }
    seenInCsv.add(normalized);

    const sourceName = String(row.sourceName || '').trim();
    const sourceUrl = String(row.sourceUrl || '').trim();
    if (!sourceName || !sourceUrl) {
      skippedReasons.push('missing_source');
      continue;
    }

    const rawConfidence = Number(row.confidence);
    if (!Number.isFinite(rawConfidence) || rawConfidence < 0 || rawConfidence > 1) {
      skippedReasons.push('invalid_confidence');
      continue;
    }

    if (scamSet.has(normalized)) {
      skippedReasons.push('already_in_official_db');
      continue;
    }

    validRows += 1;
    const existing = pendingMap.get(normalized);
    const incoming = {
      sourceName,
      sourceUrl,
      confidence: rawConfidence,
      collectedAt: now
    };

    if (!existing) {
      const sources = mergeSources([], incoming);
      const evidenceCount = new Set(sources.map((s) => sourceKey(s.sourceName, s.sourceUrl))).size;
      const confidence = computeConfidence(rawConfidence, evidenceCount);
      pendingMap.set(normalized, {
        number: normalized,
        label: 'suspicious',
        country: 'MX',
        sourceType: 'community_report',
        sourceName,
        sourceUrl,
        region: String(row.region || '').trim(),
        confidence,
        status: 'pending_review',
        evidenceCount,
        sources,
        firstSeenAt: now,
        updatedAt: now,
        note: String(row.note || '').trim()
      });
      addedToPending += 1;
      continue;
    }

    const mergedSources = mergeSources(existing.sources || [], incoming);
    const evidenceCount = new Set(mergedSources.map((s) => sourceKey(s.sourceName, s.sourceUrl))).size;
    const sourceConfMax = mergedSources.reduce((acc, s) => Math.max(acc, Number(s.confidence) || 0), 0);
    const existingBase = Number(existing.confidence) || 0;
    const confidence = computeConfidence(Math.max(existingBase, sourceConfMax), evidenceCount);

    existing.label = 'suspicious';
    existing.country = 'MX';
    existing.sourceType = 'community_report';
    existing.sourceName = existing.sourceName || sourceName;
    existing.sourceUrl = existing.sourceUrl || sourceUrl;
    existing.region = existing.region || String(row.region || '').trim();
    existing.confidence = confidence;
    existing.status = 'pending_review';
    existing.evidenceCount = evidenceCount;
    existing.sources = mergedSources;
    existing.updatedAt = now;
    if (!existing.firstSeenAt) existing.firstSeenAt = now;
    if (!existing.note && row.note) existing.note = String(row.note || '').trim();

    pendingMap.set(normalized, existing);
    updatedExistingPending += 1;
  }

  const pendingOut = Array.from(pendingMap.values()).sort((a, b) => String(a.number).localeCompare(String(b.number)));
  fs.writeFileSync(PENDING_PATH, `${JSON.stringify(pendingOut, null, 2)}\n`, 'utf8');

  const skippedReasonsSummary = skippedReasons.reduce((acc, reason) => {
    acc[reason] = (acc[reason] || 0) + 1;
    return acc;
  }, {});

  const report = {
    importedAt: now,
    csvRows: rows.length,
    validRows,
    pendingBefore: pending.length,
    pendingAfter: pendingOut.length,
    addedToPending,
    updatedExistingPending,
    skippedRows: rows.length - validRows,
    skippedReasonsSummary
  };

  fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`Community bulk import done. Added=${addedToPending}, Updated=${updatedExistingPending}`);
}

run();
