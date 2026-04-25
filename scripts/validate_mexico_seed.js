const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'data', 'mexico_seed_phone_numbers.json');
const requiredTopFields = [
  'number',
  'normalizedNumber',
  'country',
  'tag',
  'label',
  'sourceType',
  'sourceName',
  'sourceUrl',
  'note',
  'confidence',
  'createdAt',
];
const allowedTags = new Set(['scam', 'suspicious', 'safe', 'unknown']);

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

let records;
try {
  const raw = fs.readFileSync(filePath, 'utf8');
  records = JSON.parse(raw);
} catch (error) {
  fail(`Invalid JSON: ${error.message}`);
}

if (!Array.isArray(records)) {
  fail('Top-level value must be an array.');
}

const seen = new Set();

records.forEach((record, index) => {
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    fail(`Record at index ${index} must be an object.`);
  }

  for (const field of requiredTopFields) {
    if (!(field in record)) {
      fail(`Missing required field '${field}' at index ${index}.`);
    }
  }

  if (!/^\d+$/.test(String(record.normalizedNumber))) {
    fail(`normalizedNumber must be digits only at index ${index}.`);
  }

  if (!allowedTags.has(String(record.tag))) {
    fail(`Invalid tag '${record.tag}' at index ${index}.`);
  }

  const dedupeKey = String(record.normalizedNumber);
  if (seen.has(dedupeKey)) {
    fail(`Duplicate normalizedNumber '${dedupeKey}'.`);
  }
  seen.add(dedupeKey);
});

console.log('OK');
