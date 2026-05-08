#!/usr/bin/env node
const fs=require('fs');const path=require('path');
const ROOT=process.cwd();
const CSV=path.join(ROOT,'data','community_bulk_import_numbers.csv');
const DIR=path.join(ROOT,'data','community_source_snapshots');
const SNAP=path.join(DIR,'community_signals_snapshot.csv');
const REPORT=path.join(DIR,'snapshot_report.json');
const HEADER='number,label,sourceName,sourceUrl,region,note,confidence,category';
const catOk=new Set(['scam','fraud','extortion','spam','telemarketing','cobranza','publicidad','robocall','unknown']);
const ban=new Set(['911','089','088','070','072']);
const parse=(l)=>{const o=[];let c='',q=false;for(let i=0;i<l.length;i++){const ch=l[i];if(ch==='"'){if(q&&l[i+1]==='"'){c+='"';i++;}else q=!q;}else if(ch===','&&!q){o.push(c);c='';}else c+=ch;}o.push(c);return o;};
const csv=(rows)=>rows.map(r=>r.map(v=>{const t=String(v??'');return /[",\n]/.test(t)?`"${t.replace(/"/g,'""')}"`:t;}).join(',')).join('\n')+'\n';
const norm=(raw)=>{const d=String(raw||'').replace(/\D/g,'');let local='';if(d.length===10)local=d;else if(d.length===12&&d.startsWith('52'))local=d.slice(2);else if(d.length===13&&d.startsWith('521'))local=d.slice(3);else return null;if(!/^\d{10}$/.test(local)||/^([0-9])\1{9}$/.test(local)||local.startsWith('800')||ban.has(local))return null;return `+52${local}`;};
fs.mkdirSync(DIR,{recursive:true});
if(!fs.existsSync(CSV)){fs.writeFileSync(SNAP,HEADER+'\n');fs.writeFileSync(REPORT,JSON.stringify({generatedAt:new Date().toISOString(),rows:0,added:0},null,2)+'\n');process.exit(0);} 
const lines=fs.readFileSync(CSV,'utf8').split(/\r?\n/).filter(Boolean);
const rows=[];const seen=new Set();
for(let i=1;i<lines.length;i++){const c=parse(lines[i]);if(c.length<7)continue;const n=norm(c[0]);if(!n||seen.has(n))continue;seen.add(n);const category=catOk.has((c[7]||'').trim())?(c[7]||'').trim():'spam';rows.push([n,'suspicious',c[2]||'',c[3]||'',c[4]||'México',c[5]||'Reporte comunitario',String(c[6]||0.35),category]);}
fs.writeFileSync(SNAP,HEADER+'\n'+csv(rows),'utf8');
fs.writeFileSync(REPORT,JSON.stringify({generatedAt:new Date().toISOString(),rows:rows.length,added:rows.length,source:'community_bulk_import_numbers.csv'},null,2)+'\n');
