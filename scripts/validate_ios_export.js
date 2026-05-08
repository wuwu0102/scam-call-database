const fs = require('fs');

const ios = JSON.parse(fs.readFileSync('data/ios_numbers.json', 'utf8'));
const baseline = Number(process.env.IOS_BASELINE_COUNT || 0);

const badFormat = ios.filter((r) => !/^\d{10}$/.test(String(r.number || '')));
if (badFormat.length) {
  console.error(`iOS export invalid MX 10-digit numbers: ${badFormat.length}`);
  process.exit(1);
}

if (baseline > 0 && ios.length < baseline) {
  console.error(`iOS export shrank: ${ios.length} < ${baseline}`);
  process.exit(1);
}

if (ios.length < 5000) {
  console.warn(`warning: iOS export below 5000 (${ios.length})`);
}

console.log(`iOS export valid: ${ios.length}`);
