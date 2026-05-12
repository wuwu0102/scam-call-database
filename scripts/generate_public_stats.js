const fs = require('fs');
const path = require('path');
const { normalizeCategory } = require('./lib/category_normalizer');
const root = path.join(__dirname, '..');
const args = process.argv.slice(2);
const min = Number((args.find(a => a.startsWith('--min=')) || '--min=300').split('=')[1]);
const allowLow = args.includes('--allow-low-count');
const dryRun = args.includes('--dry-run');
const read=(p,d)=>{const f=path.join(root,p); return fs.existsSync(f)?JSON.parse(fs.readFileSync(f,'utf8')):d;};
const collected = read('data/collected_mexico_numbers.json',[]);
const scam = read('scam_numbers.json',[]);
const catalog = read('data/source_catalog_mexico.json',[]);
const runLog = read('data/collector_run_log.json', { sources: [], lastCollectorStatus:'partial' });
const counts = { fraudCount: 0, spamCount: 0, debtCollectionCount: 0, unknownCount: 0 };
for (const row of scam) {
  const c = normalizeCategory(row.category || '', row.label || '');
  if (c === 'fraud') counts.fraudCount++;
  else if (c === 'spam') counts.spamCount++;
  else if (c === 'debt_collection') counts.debtCollectionCount++;
  else counts.unknownCount++;
}
const searchableCount = scam.length;
const output = {
  generatedAt: new Date().toISOString(),
  nextUpdateAt: new Date(Date.now()+5*24*60*60*1000).toISOString(),
  totalSearchableCount: searchableCount,
  monitoredSignalsCount: searchableCount,
  collectedCount: collected.length,
  scamNumbersCount: scam.length,
  sourceCount: catalog.length,
  sourceSuccessCount: (runLog.sources||[]).filter(s=>(s.accepted||0)>0).length,
  sourceFailedCount: (runLog.sources||[]).filter(s=>(s.errors||[]).length>0).length,
  lastCollectorStatus: runLog.lastCollectorStatus || 'partial',
  ...counts,
};
if (!dryRun) {
  fs.writeFileSync(path.join(root,'data/public_stats.json'), `${JSON.stringify(output,null,2)}\n`);
}
console.log(`stats generated total=${output.totalSearchableCount} scam=${scam.length} collected=${collected.length} min=${min} dryRun=${dryRun}`);
if (!allowLow && output.totalSearchableCount < min) throw new Error(`totalSearchableCount below minimum: ${output.totalSearchableCount} < ${min}`);
