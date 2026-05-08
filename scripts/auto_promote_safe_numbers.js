const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PENDING = path.join(ROOT, 'data', 'pending_numbers.json');
const SCAM = path.join(ROOT, 'scam_numbers.json');
const BACKUP = path.join(ROOT, 'data', 'backups', 'scam_numbers.backup.json');
const REPORT = path.join(ROOT, 'data', 'collection_report.json');

const officialTypes = new Set(['official_federal', 'official_state']);
const neverAutoPromoteTypes = new Set(['public_report', 'news_or_public_reference', 'manual_import']);

function safeReadArray(file){ try{ const p=JSON.parse(fs.readFileSync(file,'utf8')); return Array.isArray(p)?p:[];}catch{return [];} }
function isValid(num){ return /^\+52\d{10}$/.test(num||'') && !/^\+52(911|089|088|070|072|800|1800|01800)/.test(num); }

function shouldPromote(i){
  if (!i || !isValid(i.number) || i.skipReason) return false;
  if (neverAutoPromoteTypes.has(i.sourceType)) return false;
  return officialTypes.has(i.sourceType) && Number(i.confidence || 0) >= 0.8;
}

function run(){
  const pending=safeReadArray(PENDING);
  const current=safeReadArray(SCAM);
  const previousOfficialCount=current.length;
  const by=new Map(current.map((i)=>[i.number,i]));

  const eligible = pending.filter((item)=> item && item.number && !by.has(item.number) && shouldPromote(item));
  const promoteLimitHit = eligible.length > 2500;
  const promoteList = promoteLimitHit ? [] : eligible;

  let promoted=0;
  for(const item of promoteList){
    by.set(item.number,{number:item.number,label:item.label||'suspicious',country:item.country||'MX',lastUpdated:new Date().toISOString(),source:item.sourceName||item.sourceType||'auto'});
    promoted++;
  }

  const next=Array.from(by.values()).sort((a,b)=>a.number.localeCompare(b.number));
  if (next.length < previousOfficialCount) throw new Error(`Safety gate: scam_numbers.json cannot shrink (${next.length} < ${previousOfficialCount})`);

  fs.mkdirSync(path.dirname(BACKUP),{recursive:true});
  fs.writeFileSync(BACKUP, `${JSON.stringify(current,null,2)}\n`,'utf8');
  fs.writeFileSync(SCAM,`${JSON.stringify(next,null,2)}\n`,'utf8');

  try {
    const obj=JSON.parse(fs.readFileSync(REPORT,'utf8'));
    obj.previousOfficialCount=previousOfficialCount;
    obj.newOfficialCount=next.length;
    obj.officialPromotedThisRun=promoted;
    obj.pendingPromotionDeferred = promoteLimitHit;
    fs.writeFileSync(REPORT,`${JSON.stringify(obj,null,2)}\n`,'utf8');
  } catch {}
  console.log(`Promoted this run: ${promoted}`);
  if (promoteLimitHit) console.log('Promotion deferred due to >2500 eligible additions.');
}

if(require.main===module){ run(); }
module.exports={run};
