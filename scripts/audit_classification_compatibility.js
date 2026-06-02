const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const DEFAULT_INPUT = path.join(root, 'data', 'mexico_seed_phone_numbers.json');

const ALLOWED_CATEGORIES = new Set([
  'scam',
  'suspicious',
  'telemarketing',
  'cobranza',
  'bank',
  'government',
  'delivery',
  'safe'
]);

const LEGACY_TAG_TO_CATEGORY = new Map([
  ['scam', 'scam'],
  ['fraud', 'scam'],
  ['extortion', 'scam'],
  ['phishing', 'scam'],
  ['suspicious', 'suspicious'],
  ['unknown_risk', 'suspicious'],
  ['crowd_signal', 'suspicious'],
  ['senal reportada por multiples fuentes', 'suspicious'],
  ['senal comunitaria reportada', 'suspicious'],
  ['spam', 'telemarketing'],
  ['telemarketing', 'telemarketing'],
  ['collection', 'cobranza'],
  ['debt_collection', 'cobranza'],
  ['cobranza', 'cobranza'],
  ['bank', 'bank'],
  ['government', 'government'],
  ['delivery', 'delivery'],
  ['safe', 'safe']
]);

function usage() {
  console.log(`Usage: node scripts/audit_classification_compatibility.js [--input=<json-file>] [--fail-on-unmapped]\n\nRead-only audit for the Phase 1 category compatibility layer.\nDefault input: data/mexico_seed_phone_numbers.json\n\nThis script does not write files and does not modify Firestore.`);
}

function getArg(name) {
  const prefix = `${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

function readJsonArray(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(raw);
  if (Array.isArray(parsed)) return parsed;
  if (parsed && Array.isArray(parsed.records)) return parsed.records;
  throw new Error(`Expected an array or { records: [] } in ${filePath}`);
}

function normalizeValue(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return '';
  return String(value)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function resolveCategory(record) {
  const explicitCategory = normalizeValue(record.category);
  if (ALLOWED_CATEGORIES.has(explicitCategory)) {
    return { category: explicitCategory, sourceField: 'category', mapped: true };
  }

  const legacyTag = normalizeValue(record.tag);
  if (LEGACY_TAG_TO_CATEGORY.has(legacyTag)) {
    return {
      category: LEGACY_TAG_TO_CATEGORY.get(legacyTag),
      sourceField: 'tag',
      mapped: true
    };
  }

  return {
    category: null,
    sourceField: explicitCategory ? 'category' : 'tag',
    mapped: false,
    legacyTag
  };
}

function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    usage();
    return;
  }

  const input = path.resolve(root, getArg('--input') || DEFAULT_INPUT);
  const failOnUnmapped = process.argv.includes('--fail-on-unmapped');
  const records = readJsonArray(input);

  const totals = {
    records: records.length,
    compatible: 0,
    unmapped: 0,
    byCategory: Object.fromEntries(Array.from(ALLOWED_CATEGORIES).map((category) => [category, 0])),
    byLegacyTag: {},
    unmappedValues: {}
  };

  records.forEach((record) => {
    const legacyTag = normalizeValue(record.tag) || '(missing)';
    totals.byLegacyTag[legacyTag] = (totals.byLegacyTag[legacyTag] || 0) + 1;

    const resolved = resolveCategory(record);
    if (resolved.mapped) {
      totals.compatible += 1;
      totals.byCategory[resolved.category] += 1;
      return;
    }

    totals.unmapped += 1;
    const key = resolved.legacyTag || normalizeValue(record.category) || '(missing)';
    totals.unmappedValues[key] = (totals.unmappedValues[key] || 0) + 1;
  });

  console.log('Phase 1 category compatibility audit');
  console.log(`Input: ${path.relative(root, input)}`);
  console.log(`Records checked: ${totals.records}`);
  console.log(`Compatible records: ${totals.compatible}`);
  console.log(`Unmapped records: ${totals.unmapped}`);
  console.log('Allowed category counts:');
  for (const category of ALLOWED_CATEGORIES) {
    console.log(`- ${category}: ${totals.byCategory[category]}`);
  }

  if (totals.unmapped) {
    console.log('Unmapped values:');
    Object.entries(totals.unmappedValues)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .forEach(([value, count]) => console.log(`- ${value}: ${count}`));
  }

  if (failOnUnmapped && totals.unmapped) {
    process.exitCode = 1;
  }
}

main();
