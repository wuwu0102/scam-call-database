const fs = require('fs');
const path = require('path');
const { buildClassification, normalizeLegacyTag } = require('./lib/classification_compat');

const ROOT = path.join(__dirname, '..');
const DEFAULT_INPUTS = [
  'data/collected_mexico_numbers.json',
  'data/mexico_seed_phone_numbers.json',
  'data/ios_numbers.json',
  'scam_numbers.json'
];

function readJson(relativePath) {
  const fullPath = path.join(ROOT, relativePath);
  if (!fs.existsSync(fullPath)) return [];
  const parsed = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
  return Array.isArray(parsed) ? parsed : [];
}

function auditRecord(record) {
  const classification = buildClassification(record);
  return {
    number: record.number || record.normalizedNumber || '',
    legacyTag: normalizeLegacyTag(record),
    primaryTag: classification.primaryTag,
    riskTags: classification.riskTags,
    hasNumber: record.number !== undefined || record.normalizedNumber !== undefined,
    hasCompatLabel: record.label !== undefined,
    preservesNumberLabel: record.number !== undefined && record.label !== undefined
  };
}

function summarize(relativePath) {
  const rows = readJson(relativePath);
  const audited = rows.map(auditRecord);
  const tagCounts = audited.reduce((acc, row) => {
    acc[row.primaryTag] = (acc[row.primaryTag] || 0) + 1;
    return acc;
  }, {});
  return {
    file: relativePath,
    records: rows.length,
    missingNumber: audited.filter((row) => !row.hasNumber).length,
    missingCompatLabel: audited.filter((row) => !row.hasCompatLabel).length,
    numberLabelCompatible: audited.filter((row) => row.preservesNumberLabel).length,
    tagCounts
  };
}

function main() {
  const inputs = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
  const targets = inputs.length ? inputs : DEFAULT_INPUTS;
  const report = {
    auditedAt: new Date().toISOString(),
    mode: 'read-only',
    firestoreCollectionsPreserved: ['phone_numbers', 'phone_number_reports'],
    iosExportFormatPreserved: ['number', 'label'],
    files: targets.map(summarize)
  };
  console.log(JSON.stringify(report, null, 2));
}

main();
