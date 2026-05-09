const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SCAM = path.join(ROOT, 'scam_numbers.json');
const SEED = path.join(ROOT, 'data', 'community_seed_numbers.csv');
const NEEDED = path.join(ROOT, 'data', 'community_seed_needed.csv');
const TRUSTED = ['telefonospam mx top spam','telefonospam mx','números teléfono méxico','lada méxico spam telefónico','tellows mx','numerostelefono','numeros telefono','listaspam mx','quien-llama mx'];
const TARGET_MIN = 5000;
const TARGET_MAX = 5500;

function norm(raw){const d=String(raw||'').replace(/\D/g,'');if(d.length===10)return d;if(d.length===12&&d.startsWith('52'))return d.slice(2);return null}
function isBlocked(n){return /^(911|089|088|070|072|800|01800)/.test(n)}
function trusted(s){const x=String(s||'').toLowerCase();return TRUSTED.some(t=>x.includes(t));}
function safeReadJson(p){try{return JSON.parse(fs.readFileSync(p,'utf8'))}catch{return []}}
function readCsv(p){if(!fs.existsSync(p))return[];const lines=fs.readFileSync(p,'utf8').split(/\r?\n/).filter(Boolean);const h=lines[0].split(',').map(x=>x.trim());return lines.slice(1).map(l=>{const c=l.split(',');const o={};h.forEach((k,i)=>o[k]=(c[i]||'').trim());return o;});}

const scam=safeReadJson(SCAM); const existing=new Set(scam.map(r=>String(r.number||'').replace(/^\+52/,'')));
const candidates=[];
const sources=[
  ...safeReadJson(path.join(ROOT,'data','pending_numbers.json')),
  ...safeReadJson(path.join(ROOT,'data','collected_mexico_numbers.json')),
  ...readCsv(path.join(ROOT,'data','manual_import_numbers.csv')),
  ...readCsv(path.join(ROOT,'data','seed_verified_public_numbers.csv')),
  ...safeReadJson(path.join(ROOT,'data','crowd_signal_mexico_numbers.json'))
];
for(const r of sources){
  const sourceName=r.sourceName||r.source||''; if(!trusted(sourceName)) continue;
  const n=norm(r.number||r.normalizedNumber||r.phone||r.phone_number); if(!n||isBlocked(n)||existing.has(n)) continue;
  const sourceUrl=r.sourceUrl||''; if(!sourceUrl) continue;
  candidates.push({number:n,sourceName,sourceUrl,sourceType:r.sourceType||'community_report',confidence:Number(r.confidence||0.4),tag:r.tag||'Señal comunitaria reportada',note:r.note||'Reporte comunitario; indica posible spam o molestia, no confirmación legal.'});
  existing.add(n);
}
const need=Math.max(0,TARGET_MIN-scam.length);
const use=candidates.slice(0,Math.max(0,Math.min(TARGET_MAX-scam.length,candidates.length)));
const header='number,sourceName,sourceUrl,sourceType,confidence,tag,note';
const csv=[header,...use.map(r=>`${r.number},${r.sourceName},${r.sourceUrl},${r.sourceType},${r.confidence},${r.tag},${r.note}`)].join('\n')+'\n';
fs.writeFileSync(SEED,csv);
if(use.length<need){
  fs.writeFileSync(NEEDED,`# Add real public-source numbers here. Do not fabricate.\n${header}\n`);
}
console.log(`Seed candidates generated: ${use.length}`);
console.log(`Missing to reach 5000: ${Math.max(0,need-use.length)}`);
