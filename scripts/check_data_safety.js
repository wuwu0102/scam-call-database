const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const COLLECTED_PATH = path.join(DATA_DIR, 'collected_mexico_numbers.json');
const SEED_PATH = path.join(DATA_DIR, 'mexico_seed_phone_numbers.json');
const SCAM_PATH = path.join(__dirname, '..', 'scam_numbers.json');

function normalizeMXNumber(input) {
  if (!input) return '';
  let num = String(input).replace(/\D/g, '');
  if (num.length === 13 && num.startsWith('521')) num = num.slice(3);
  if (num.length === 12 && num.startsWith('52')) num = num.slice(2);
  if (num.length > 10) num = num.slice(-10);
  return num;
}
const isValidMXNumber = (num) => /^\d{10}$/.test(num);

const readArray = (filePath, key = null) => {
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (Array.isArray(parsed)) return parsed;
  if (key && Array.isArray(parsed[key])) return parsed[key];
  return [];
};

const toMxSet = (records) => new Set(records
  .map((record) => normalizeMXNumber(record.normalizedNumber || record.number || record.phone || ''))
  .filter(isValidMXNumber));

const collected = readArray(COLLECTED_PATH);
const seed = readArray(SEED_PATH);
const scam = readArray(SCAM_PATH, 'records').filter((record) => String(record.country || '').toUpperCase() === 'MX');

const seedSet = toMxSet(seed);
const scamSet = toMxSet(scam);
const collectedSet = toMxSet(collected);

if (collected.length === 0 && (seedSet.size > 0 || scamSet.size > 0)) {
  console.error('Safety check failed: collected_mexico_numbers.json is empty while seed/scam data has records.');
  process.exit(1);
}

if (collectedSet.size < seedSet.size) {
  console.error(`Safety check failed: collected MX unique count (${collectedSet.size}) is less than seed unique count (${seedSet.size}).`);
  process.exit(1);
}

const invalid = collected.filter((record) => !isValidMXNumber(normalizeMXNumber(record.normalizedNumber || record.number || '')));
if (invalid.length > 0) {
  console.error(`Safety check failed: found ${invalid.length} invalid normalizedNumber values in collected data.`);
  process.exit(1);
}

console.log(`Safety check passed. collected=${collectedSet.size} seed=${seedSet.size} scamMX=${scamSet.size}`);
