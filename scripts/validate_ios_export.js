const fs = require('fs');

const ios = JSON.parse(fs.readFileSync('data/ios_numbers.json', 'utf8'));
const baseline = Number(process.env.IOS_BASELINE_COUNT || 0);

const banned = /^(911|089|088|070|072|800|01800)/;
const badFormat = ios.filter((r) => !/^\+52\d{10}$/.test(String(r.number || '')));
if (badFormat.length) {
  console.error(`iOS export invalid +52 format numbers: ${badFormat.length}`);
  process.exit(1);
}
const serviceRows = ios.filter((r) => { const n = String(r.number || '').replace(/^\+52/, ''); return banned.test(n); });
if (serviceRows.length) {
  console.error(`iOS export contains service/hotline numbers: ${serviceRows.length}`);
  process.exit(1);
}
if (baseline > 0 && ios.length < baseline) {
  console.error(`iOS export shrank: ${ios.length} < ${baseline}`);
  process.exit(1);
}
if (ios.length < 5000) console.warn(`warning: iOS export below 5000 (${ios.length})`);
console.log(`iOS export valid: ${ios.length}`);
