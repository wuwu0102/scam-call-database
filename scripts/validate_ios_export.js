const fs = require('fs');

const ios = JSON.parse(fs.readFileSync('data/ios_numbers.json', 'utf8'));
const baseline = Number(process.env.IOS_BASELINE_COUNT || 0);

const REQUIRED_CATEGORY_LABELS = ['Posible fraude', 'Número desconocido'];
const OPTIONAL_CATEGORY_LABELS = ['Telemarketing', 'Cobranza', 'Acoso'];
const CATEGORY_LABELS = [...REQUIRED_CATEGORY_LABELS, ...OPTIONAL_CATEGORY_LABELS];

function countCategoryLabels(rows) {
  return rows.reduce((acc, row) => {
    const label = String(row.label || '');
    if (CATEGORY_LABELS.includes(label)) {
      acc[label] += 1;
    }
    return acc;
  }, Object.fromEntries(CATEGORY_LABELS.map((label) => [label, 0])));
}

const banned = /^(911|089|088|070|072|800|01800)/;
const badFormat = ios.filter((r) => !/^\d{10}$/.test(String(r.number || '')));
if (badFormat.length) {
  console.error(`iOS export invalid MX 10-digit numbers: ${badFormat.length}`);
  process.exit(1);
}
const serviceRows = ios.filter((r) => banned.test(String(r.number || '')));
if (serviceRows.length) {
  console.error(`iOS export contains service/hotline numbers: ${serviceRows.length}`);
  process.exit(1);
}
if (baseline > 0 && ios.length < baseline) {
  console.error(`iOS export shrank: ${ios.length} < ${baseline}`);
  process.exit(1);
}
if (ios.length < 5000) console.warn(`warning: iOS export below 5000 (${ios.length})`);

const categoryCounts = countCategoryLabels(ios);
console.log('Category counts:');
console.log(JSON.stringify(categoryCounts, null, 2));

for (const label of OPTIONAL_CATEGORY_LABELS) {
  if (categoryCounts[label] === 0) {
    console.log(`WARNING: ${label} count is 0`);
  }
}

const missingRequiredLabels = REQUIRED_CATEGORY_LABELS.filter((label) => categoryCounts[label] === 0);
if (missingRequiredLabels.length) {
  console.error(`iOS export missing required category coverage: ${missingRequiredLabels.join(', ')}`);
  process.exit(1);
}
console.log(`iOS export valid: ${ios.length}`);
