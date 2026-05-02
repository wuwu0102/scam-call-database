const fs = require('fs');
const stats = JSON.parse(fs.readFileSync('data/public_stats.json','utf8'));
const count = Number(stats.totalSearchableCount || 0);
if (count < 755) { console.error(`public searchable below baseline: ${count}`); process.exit(1); }
if (count < 1000) console.warn(`warning: public searchable below target 1000: ${count}`);
console.log(`public searchable baseline ok: ${count}`);
