const fs = require('fs');

const ios = JSON.parse(fs.readFileSync('data/ios_numbers.json', 'utf8'));
const scam = JSON.parse(fs.readFileSync('scam_numbers.json', 'utf8'));
const baseline = Number(process.env.IOS_BASELINE_COUNT || 0);

const banned = /^(911|089|088|070|072|800|01800)/;
if (ios.some((r) => !/^\d{10}$/.test(String(r.number || '')))) { console.error('iOS export invalid MX 10-digit numbers'); process.exit(1); }
if (ios.some((r) => banned.test(String(r.number || '')))) { console.error('iOS export contains service/hotline numbers'); process.exit(1); }
if (baseline > 0 && ios.length < baseline) { console.error(`iOS export shrank: ${ios.length} < ${baseline}`); process.exit(1); }
if (scam.length >= 5000 && baseline > 0 && ios.length <= baseline) { console.error(`iOS did not increase while scam >= 5000 (${ios.length} <= ${baseline})`); process.exit(1); }
if (ios.length < 5000) console.warn(`warning: iOS export below 5000 (${ios.length})`);
console.log(`iOS export valid: ${ios.length}`);
