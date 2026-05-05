const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PENDING = path.join(ROOT, 'data', 'pending_numbers.json');
const SCAM = path.join(ROOT, 'scam_numbers.json');
const BACKUP = path.join(ROOT, 'data', 'backups', 'scam_numbers.backup.json');
const TMP = path.join(ROOT, 'scam_numbers.tmp.json');
const REPORT = path.join(ROOT, 'data', 'collection_report.json');

const officialTypes = new Set(['official_federal', 'official_state', 'official_state_announcement']);
const restrictedTypes = new Set(['public_report', 'news_or_public_reference', 'manual_import']);

function safeReadArray(file){ try{ const p=JSON.parse(fs.readFileSync(file,'utf8')); return Array.isArray(p)?p:[];}catch{return [];} }
function isValid(num){ return /^\+52\d{10}$/.test(num||'') && !/^\+52(911|089|088|070|072)/.test(num) && !/^\+52800/.test(num); }
function validateScamNumbersJson(records){ if(!Array.isArray(records)) return {ok:false,error:'not_array'}; const seen=new Set(); for(const r of records){ if(!r || !r.number) return {ok:false,error:'missing_number'}; if(!isValid(r.number)) return {ok:false,error:`invalid_number:${r.number}`}; if(seen.has(r.number)) return {ok:false,error:`duplicate:${r.number}`}; seen.add(r.number);} return {ok:true}; }

function shouldPromote(i){ const conf=Number(i.confidence||0); const ev=Number(i.evidenceCount||1); if(i.skipReason) return false; if(!isValid(i.number)) return false; if(restrictedTypes.has(i.sourceType)) return conf>=0.85 && ev>=2; return conf>=0.8 && officialTypes.has(i.sourceType); }

function run(){ const pending=safeReadArray(PENDING); const current=safeReadArray(SCAM); const previousOfficialCount=current.length; const by=new Map(current.map((i)=>[i.number,i])); let promoted=0;
 for(const item of pending){ if(!item || !item.number || by.has(item.number)) continue; if(!shouldPromote(item)) continue; by.set(item.number,{number:item.number,label:item.label||'suspicious',country:item.country||'MX',lastUpdated:new Date().toISOString(),source:item.sourceName||item.sourceType||'auto'}); promoted++; }
 const next=Array.from(by.values()).sort((a,b)=>a.number.localeCompare(b.number)); fs.mkdirSync(path.dirname(BACKUP),{recursive:true}); fs.writeFileSync(BACKUP, `${JSON.stringify(current,null,2)}\n`,'utf8'); fs.writeFileSync(TMP,`${JSON.stringify(next,null,2)}\n`,'utf8'); const parsedTmp=safeReadArray(TMP); const valid=validateScamNumbersJson(parsedTmp); if(!valid.ok){ console.error(`Validation failed: ${valid.error}`); process.exit(1);} fs.renameSync(TMP,SCAM);
 const report = safeReadArray(REPORT) || {};
 try {
  const obj=JSON.parse(fs.readFileSync(REPORT,'utf8'));
  obj.previousOfficialCount=previousOfficialCount;
  obj.newOfficialCount=next.length;
  obj.promotedThisRun=promoted;
  fs.writeFileSync(REPORT,`${JSON.stringify(obj,null,2)}\n`,'utf8');
 } catch {}
 console.log(`Promoted this run: ${promoted}`);
}

if(require.main===module){ run(); }
module.exports={validateScamNumbersJson,run};
