const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CSV = path.join(ROOT, 'data', 'community_seed_numbers.csv');
const REJECTS = path.join(ROOT, 'data', 'community_seed_rejects.csv');
const SCAM = path.join(ROOT, 'scam_numbers.json');
const IOS = path.join(ROOT, 'data', 'ios_numbers.json');
const REPORT = path.join(ROOT, 'data', 'collection_report.json');
const MAX_ADD = 5000;
const MAX_SCAM = 6000;
const ALLOWED_TYPES = new Set(['community_report','public_report','official_state','official_federal','official_state_announcement','official_state_lookup','financial_fraud']);

function normMx(raw){const d=String(raw||'').replace(/\D/g,'');if(d.length===10)return d;if(d.length===12&&d.startsWith('52'))return d.slice(2);return null;}
function blocked(n){return /^(911|089|088|070|072|800|01800)/.test(n);}
function badText(v){return /(emergencia|denuncia\s*hotline|contacto|oficina|conmutador|soporte|servicio\s*al\s*cliente|customer\s*support|hotline|service|contact)/i.test(String(v||''));}
function csvRows(text){return text.split(/\r?\n/).filter(Boolean).filter(l=>!l.startsWith('#'));}

const scam=JSON.parse(fs.readFileSync(SCAM,'utf8')); const ios=JSON.parse(fs.readFileSync(IOS,'utf8'));
const report=fs.existsSync(REPORT)?JSON.parse(fs.readFileSync(REPORT,'utf8')):{};
const seenScam=new Set(scam.map(r=>String(r.number||'').replace(/^\+52/,'')));
const seenIos=new Set(ios.map(r=>String(r.number||'')));

const lines=csvRows(fs.readFileSync(CSV,'utf8')); const head=lines[0].split(','); const idx=Object.fromEntries(head.map((h,i)=>[h.trim(),i]));
let added=0; const rejects=[]; const sourceCount={};
for(let i=1;i<lines.length;i++){
  const cols=lines[i].split(',');
  const row={number:cols[idx.number],sourceName:cols[idx.sourceName],sourceUrl:cols[idx.sourceUrl],sourceType:cols[idx.sourceType],confidence:Number(cols[idx.confidence]),tag:cols[idx.tag]||'Señal comunitaria reportada',note:cols[idx.note]||'Reporte comunitario; indica posible spam o molestia, no confirmación legal.'};
  const n=normMx(row.number);
  let reason='';
  if(!n) reason='invalid_mx'; else if(blocked(n)) reason='blocked_number'; else if(!row.sourceName||!row.sourceUrl) reason='missing_source'; else if(!ALLOWED_TYPES.has(row.sourceType)) reason='invalid_source_type'; else if(!(row.confidence>=0&&row.confidence<=1)) reason='invalid_confidence'; else if(badText(`${row.sourceName} ${row.sourceUrl} ${row.note}`)) reason='service_text'; else if(['community_report','public_report'].includes(row.sourceType)&&!/no confirmación legal|riesgo potencial/i.test(row.note)) reason='missing_disclaimer';
  if(reason){rejects.push([row.number,row.sourceName,row.sourceUrl,row.sourceType,row.confidence,row.tag,row.note,reason]);continue;}
  if(seenScam.has(n)) continue;
  if(added>=MAX_ADD){rejects.push([row.number,row.sourceName,row.sourceUrl,row.sourceType,row.confidence,row.tag,row.note,'max_add_reached']);continue;}
  const now=new Date().toISOString();
  scam.push({number:`+52${n}`,label:'Número sospechoso',tag:row.tag,country:'MX',sourceName:row.sourceName,sourceUrl:row.sourceUrl,sourceType:row.sourceType,confidence:row.confidence,note:row.note,updatedAt:now,lastUpdated:now});
  seenScam.add(n); added++; sourceCount[row.sourceName]=(sourceCount[row.sourceName]||0)+1;
  if(!seenIos.has(n)){ios.push({number:n,label:'Número sospechoso',updatedAt:now.slice(0,10)});seenIos.add(n);}
}
if(scam.length>MAX_SCAM) throw new Error(`scam_numbers.json too large: ${scam.length}`);
if(lines.length>1 && rejects.length/(lines.length-1)>0.2) throw new Error(`reject ratio too high: ${rejects.length}/${lines.length-1}`);
fs.writeFileSync(SCAM,JSON.stringify(scam,null,2)+'\n'); fs.writeFileSync(IOS,JSON.stringify(ios,null,2)+'\n');
const rejHeader='number,sourceName,sourceUrl,sourceType,confidence,tag,note,reason\n';
fs.writeFileSync(REJECTS,rejHeader+rejects.map(r=>r.join(',')).join('\n')+(rejects.length?'\n':''));
report.importedFromSeed=added; report.rejectedFromSeed=rejects.length; report.seedTopSources=sourceCount; report.finalScamCount=scam.length; report.finalIosCount=ios.length; report.reached5000=scam.length>=5000; fs.writeFileSync(REPORT,JSON.stringify(report,null,2)+'\n');
console.log(`Imported community seed numbers: ${added}`); console.log(`Rejected community seed rows: ${rejects.length}`);
