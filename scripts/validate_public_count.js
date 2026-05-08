const fs = require('fs');

const stats = fs.existsSync('data/public_stats.json')
  ? JSON.parse(fs.readFileSync('data/public_stats.json', 'utf8'))
  : {};
const scam = fs.existsSync('scam_numbers.json')
  ? JSON.parse(fs.readFileSync('scam_numbers.json', 'utf8'))
  : [];

const statsCount = Number(stats.totalSearchableCount || 0);
const count = statsCount > 0 ? statsCount : scam.length;

if (count < 755) {
  console.error(`public searchable below baseline: ${count}`);
  process.exit(1);
}
if (count < 1000) console.warn(`warning: public searchable below target 1000: ${count}`);
if (statsCount === 0) console.warn(`warning: totalSearchableCount missing; fallback to scam_numbers.json count (${scam.length})`);
console.log(`public searchable baseline ok: ${count}`);
