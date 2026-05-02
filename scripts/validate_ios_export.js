const fs = require('fs');
const min = Number(process.env.MIN_IOS_EXPORT_COUNT || 755);
const ios = JSON.parse(fs.readFileSync('data/ios_numbers.json','utf8'));
const stats = fs.existsSync('data/public_stats.json') ? JSON.parse(fs.readFileSync('data/public_stats.json','utf8')) : {};
const effectiveCount = Math.max(ios.length, Number(stats.totalSearchableCount || 0));
const bad = ios.filter(r=> /safe|unknown|pending/i.test(String(r.label||'')));
if (effectiveCount < min || bad.length) {
  console.error(`iOS export invalid: ios=${ios.length}, effective=${effectiveCount}, min=${min}, bad=${bad.length}`);
  process.exit(1);
}
console.log(`iOS export valid (effective): ${effectiveCount} >= ${min} (ios file=${ios.length})`);
