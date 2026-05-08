const fs = require('fs');

function read(file, fallback){ try { return JSON.parse(fs.readFileSync(file,'utf8')); } catch { return fallback; } }
const stats = read('data/public_stats.json', {});
const scam = read('scam_numbers.json', []);
const ios = read('data/ios_numbers.json', []);
const baseline = Number(process.env.MIN_PUBLIC_COUNT || 755);
const count = Math.max(Number(stats.totalSearchableCount || 0), Array.isArray(scam) ? scam.length : 0, Array.isArray(ios) ? ios.length : 0);
if (count < baseline) { console.error(`public searchable below baseline: ${count}`); process.exit(1); }
if (count < 5000) console.warn(`warning: public searchable below target 5000: ${count}`);
console.log(`public searchable baseline ok: ${count}`);
