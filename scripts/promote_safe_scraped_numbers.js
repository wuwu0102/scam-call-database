#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const ROOT = process.cwd();
const PENDING = path.join(ROOT,'data','pending_numbers.json');
const SCAM = path.join(ROOT,'scam_numbers.json');
const TMP = path.join(ROOT,'scam_numbers.tmp.json');
const BACKUP = path.join(ROOT,'data','backups','scam_numbers.backup.json');
const REPORT = path.join(ROOT,'data','scrape_report.json');
const banned=['911','089','088','070','072'];
function validate(a){if(!Array.isArray(a))throw new Error('not array');const s=new Set();for(const r of a){if(!/^\+52\d{10}$/.test(r.number||''))throw new Error('bad format'); if(s.has(r.number)) throw new Error('dup'); s.add(r.number); if(banned.includes(r.number.slice(3))||r.number.startsWith('+52800')||r.number.startsWith('+5201800')) throw new Error('banned');}}
const pending=fs.existsSync(PENDING)?JSON.parse(fs.readFileSync(PENDING,'utf8')):[];
const official=JSON.parse(fs.readFileSync(SCAM,'utf8')); validate(official); const before=official.length;
const by=new Map(official.map(x=>[x.number,x])); const keep=[]; let promoted=0;
for(const p of pending){ if (promoted>=300){ keep.push(p); continue; }const types=new Set((p.sources||[]).map(s=>s.type)); const conf=Number(p.confidence)||0; const ev=Number(p.evidenceCount)||0;
const okOfficial=(types.has('official_state_announcement')||types.has('official_federal'))&&conf>=0.8;
const okCommunity=types.has('community_report')&&ev>=3&&conf>=0.75;
if(okOfficial||okCommunity){ if(!by.has(p.number)){by.set(p.number,{number:p.number,country:'MX',label:p.label||'suspicious',confidence:conf,sourceName:'scraped_pending_promoted',sourceUrl:'',updatedAt:new Date().toISOString()}); promoted++; }} else keep.push(p); }
const merged=Array.from(by.values());
fs.mkdirSync(path.dirname(BACKUP),{recursive:true}); fs.copyFileSync(SCAM,BACKUP);
fs.writeFileSync(TMP,JSON.stringify(merged,null,2)+'\n');
try{const parsed=JSON.parse(fs.readFileSync(TMP,'utf8')); validate(parsed); fs.copyFileSync(TMP,SCAM); fs.unlinkSync(TMP);}catch(e){if(fs.existsSync(TMP))fs.unlinkSync(TMP); console.error(e.message); process.exit(1);} 
fs.writeFileSync(PENDING,JSON.stringify(keep,null,2)+'\n');
const report=fs.existsSync(REPORT)?JSON.parse(fs.readFileSync(REPORT,'utf8')):{};
Object.assign(report,{officialBefore:before,officialAfter:merged.length,promotedThisRun:promoted,scrapedAt:report.scrapedAt||new Date().toISOString()});
fs.writeFileSync(REPORT,JSON.stringify(report,null,2)+'\n');
console.log(`Promoted ${promoted}`);
