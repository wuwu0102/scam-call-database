const fs = require('fs');
const path = require('path');

const seedPath = path.join(__dirname, '..', 'data', 'mexico_seed_phone_numbers.json');
const scamPath = path.join(__dirname, '..', 'scam_numbers.json');
const iosPath = path.join(__dirname, '..', 'data', 'ios_numbers.json');

const CONFIDENCE_SCORE = {
  high: 3,
  medium: 2,
  low: 1,
};

const TYPE_SCORE = {
  official: 3,
  community: 2,
  user_report: 1,
};

const ALLOWED_TAGS = new Set(['scam', 'suspicious', 'safe', 'unknown']);

function readJsonIfPresent(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function normalizeDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function normalizeDate(value) {
  if (typeof value === 'string' && value) return value.slice(0, 10);
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value).toISOString().slice(0, 10);
  }
  return new Date().toISOString().slice(0, 10);
}

function normalizeRecord(raw) {
  const normalizedNumber = normalizeDigits(
    raw.normalizedNumber || raw.normalizedPhone || raw.number || raw.phone
  );

  if (!normalizedNumber) return null;

  const type = String(raw.type || raw.sourceType || 'community').toLowerCase();
  const confidence = String(raw.confidence || 'low').toLowerCase();
  const source = raw.source || raw.sourceName || 'Unknown source';

  const rawTag = String(raw.tag || '').toLowerCase();
  const rawLabel = String(raw.label || '').toLowerCase();
  const tag = ALLOWED_TAGS.has(rawTag) ? rawTag : ALLOWED_TAGS.has(rawLabel) ? rawLabel : 'unknown';

  const displayLabel =
    (typeof raw.label === 'string' && !ALLOWED_TAGS.has(rawLabel) && raw.label) ||
    (typeof raw.tag === 'string' && !ALLOWED_TAGS.has(rawTag) && raw.tag) ||
    (typeof raw.tag === 'object' && raw.tag) ||
    (typeof raw.label === 'object' && raw.label) ||
    'Posible fraude';

  return {
    number: normalizeDigits(raw.number || raw.phone || normalizedNumber) || normalizedNumber,
    normalizedNumber,
    country: raw.country || (normalizedNumber.length === 10 ? 'MX' : ''),
    tag,
    label: displayLabel,
    type,
    sourceType: type,
    confidence,
    source,
    sourceName: source,
    sourceUrl: raw.sourceUrl || '',
    note: raw.note || '',
    updatedAt: normalizeDate(raw.updatedAt || raw.createdAt),
  };
}

function scoreRecord(record) {
  return (TYPE_SCORE[record.type] || 0) * 10 + (CONFIDENCE_SCORE[record.confidence] || 0);
}

function preferRecord(a, b) {
  const scoreA = scoreRecord(a);
  const scoreB = scoreRecord(b);

  if (scoreA !== scoreB) return scoreA > scoreB ? a : b;

  return a.updatedAt >= b.updatedAt ? a : b;
}

function toScamNumbersRecord(record) {
  return {
    phone: record.number,
    normalizedNumber: record.normalizedNumber,
    country: record.country,
    label: record.tag,
    tag: record.label,
    type: record.type,
    sourceType: record.sourceType,
    confidence: record.confidence,
    source: record.source,
    sourceName: record.sourceName,
    sourceUrl: record.sourceUrl,
    note: record.note,
    updatedAt: record.updatedAt,
  };
}

function toMxE164Integer(record) {
  const digits = normalizeDigits(record.normalizedNumber);

  if (!digits) return null;

  let e164Digits = '';
  if (digits.length === 10) {
    e164Digits = `52${digits}`;
  } else if (digits.length === 12 && digits.startsWith('52')) {
    e164Digits = digits;
  } else {
    return null;
  }

  const number = Number(e164Digits);
  if (!Number.isSafeInteger(number) || number <= 0) return null;

  const label =
    typeof record.label === 'string'
      ? record.label
      : record.label?.['es-MX'] || record.label?.en || 'Posible fraude';

  return { number, label };
}

function main() {
  const seedData = readJsonIfPresent(seedPath, []);
  const existingScamData = readJsonIfPresent(scamPath, { version: 'mvp-1', records: [] });

  const seedRecords = Array.isArray(seedData) ? seedData : [];
  const existingRecords = Array.isArray(existingScamData.records) ? existingScamData.records : [];

  const mergedMap = new Map();

  [...existingRecords, ...seedRecords]
    .map(normalizeRecord)
    .filter(Boolean)
    .forEach((record) => {
      const existing = mergedMap.get(record.normalizedNumber);
      if (!existing) {
        mergedMap.set(record.normalizedNumber, record);
      } else {
        mergedMap.set(record.normalizedNumber, preferRecord(record, existing));
      }
    });

  const mergedRecords = Array.from(mergedMap.values()).sort((a, b) =>
    a.normalizedNumber.localeCompare(b.normalizedNumber)
  );

  const scamNumbersOutput = {
    version: existingScamData.version || 'mvp-1',
    records: mergedRecords.map(toScamNumbersRecord),
  };

  fs.writeFileSync(scamPath, `${JSON.stringify(scamNumbersOutput, null, 2)}\n`, 'utf8');

  const iosSeen = new Set();
  const iosOutput = mergedRecords
    .filter((record) => ['scam', 'suspicious'].includes(record.tag))
    .map(toMxE164Integer)
    .filter((record) => record && !iosSeen.has(record.number) && iosSeen.add(record.number))
    .sort((a, b) => a.number - b.number);

  fs.writeFileSync(iosPath, `${JSON.stringify(iosOutput, null, 2)}\n`, 'utf8');

  console.log(`Merged ${seedRecords.length} seed records with ${existingRecords.length} existing records.`);
  console.log(`Wrote ${mergedRecords.length} records to scam_numbers.json.`);
  console.log(`Wrote ${iosOutput.length} records to data/ios_numbers.json.`);
}

main();
