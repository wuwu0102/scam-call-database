const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PENDING_PATH = path.join(ROOT, 'data', 'pending_numbers.json');
const SCAM_PATH = path.join(ROOT, 'scam_numbers.json');

function loadJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    console.warn(`Failed to parse ${filePath}: ${error.message}`);
    return fallback;
  }
}

function isPromotable(item) {
  if (!item || !item.number) return false;
  if (item.status === 'approved') return true;
  return item.status === 'pending_review_high_confidence' && Number(item.evidenceCount || 0) >= 2;
}

function run() {
  const pending = loadJson(PENDING_PATH, []);
  const scamDb = loadJson(SCAM_PATH, { version: 1, records: [] });
  const existingRecords = Array.isArray(scamDb.records) ? scamDb.records : [];
  const byNumber = new Set(existingRecords.map((r) => r.normalizedNumber || r.phone || ''));

  const today = new Date().toISOString().slice(0, 10);
  let promotedCount = 0;

  for (const item of pending) {
    if (!isPromotable(item)) continue;
    if (byNumber.has(item.number)) continue;

    existingRecords.push({
      phone: item.number,
      normalizedNumber: item.number,
      country: 'MX',
      label: 'suspicious',
      tag: {
        'zh-TW': '可疑',
        en: 'Suspicious',
        'es-MX': 'Sospechoso',
      },
      type: 'community',
      sourceType: item.sourceType || 'manual_import',
      confidence: item.confidence >= 0.85 ? 'high' : 'medium',
      source: item.sourceName || 'Pending Review Queue',
      sourceName: item.sourceName || 'Pending Review Queue',
      sourceUrl: item.sourceUrl || '',
      sources: item.sources || [],
      evidenceCount: item.evidenceCount || (item.sources || []).length || 1,
      note: item.note || '',
      updatedAt: today,
    });

    byNumber.add(item.number);
    promotedCount += 1;
  }

  scamDb.records = existingRecords;
  fs.writeFileSync(SCAM_PATH, `${JSON.stringify(scamDb, null, 2)}\n`, 'utf8');
  console.log(`Promoted ${promotedCount} pending numbers into scam_numbers.json`);
}

if (require.main === module) {
  run();
}

module.exports = { run, isPromotable };
