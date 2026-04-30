const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const args = process.argv.slice(2);
const min = Number((args.find(a => a.startsWith('--min=')) || '--min=300').split('=')[1]);
const allowLow = args.includes('--allow-low-count');
const read=(p,d)=>{const f=path.join(root,p); return fs.existsSync(f)?JSON.parse(fs.readFileSync(f,'utf8')):d;};
const collected = read('data/collected_mexico_numbers.json',[]);
const catalog = read('data/source_catalog_mexico.json',[]);
const runLog = read('data/collector_run_log.json', { sources: [], lastCollectorStatus:'partial' });
const output = {
  generatedAt: new Date().toISOString(),
  nextUpdateAt: new Date(Date.now()+5*24*60*60*1000).toISOString(),
  totalSearchableCount: collected.length,
  collectedCount: collected.length,
  sourceCount: catalog.length,
  sourceSuccessCount: (runLog.sources||[]).filter(s=>(s.accepted||0)>0).length,
  sourceFailedCount: (runLog.sources||[]).filter(s=>(s.errors||[]).length>0).length,
  lastCollectorStatus: runLog.lastCollectorStatus || 'partial'
};
fs.writeFileSync(path.join(root,'data/public_stats.json'), `${JSON.stringify(output,null,2)}\n`);
console.log(`stats generated total=${output.totalSearchableCount} min=${min}`);
if (!allowLow && output.totalSearchableCount < min) throw new Error(`totalSearchableCount below minimum: ${output.totalSearchableCount} < ${min}`);
