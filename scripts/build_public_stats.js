#!/usr/bin/env node
const fs=require('fs');const path=require('path');
const ROOT=process.cwd();const SCAM=path.join(ROOT,'scam_numbers.json');const PENDING=path.join(ROOT,'data','pending_numbers.json');const BULK=path.join(ROOT,'data','community_bulk_import_numbers.csv');const OUT=path.join(ROOT,'data','public_stats.json');
const cats=['scam','fraud','extortion','spam','telemarketing','cobranza','publicidad','robocall','unknown'];
const parse=l=>{const o=[];let c='',q=false;for(let i=0;i<l.length;i++){const ch=l[i];if(ch==='"'){if(q&&l[i+1]==='"'){c+='"';i++;}else q=!q;}else if(ch===','&&!q){o.push(c);c='';}else c+=ch;}o.push(c);return o;};
const norm=x=>{const d=String(x||'').replace(/\D/g,'');if(d.length===10)return '+52'+d;if(d.length===12&&d.startsWith('52')) return '+'+d;if(d.length===13&&d.startsWith('521'))return '+52'+d.slice(3); return null;};
const official=new Set((JSON.parse(fs.readFileSync(SCAM,'utf8'))||[]).map(x=>x.number));const pending=fs.existsSync(PENDING)?JSON.parse(fs.readFileSync(PENDING,'utf8')):[];const pool=new Set();const b=Object.fromEntries(cats.map(c=>[c,0]));
for(const p of pending){const n=norm(p.number);if(!n||official.has(n))continue;pool.add(n);const c=cats.includes(String(p.category||'unknown').toLowerCase())?String(p.category||'unknown').toLowerCase():'unknown';b[c]++;}
if(fs.existsSync(BULK)){const lines=fs.readFileSync(BULK,'utf8').split(/\r?\n/).filter(Boolean);for(let i=1;i<lines.length;i++){const c=parse(lines[i]);const n=norm(c[0]);if(!n||official.has(n))continue;pool.add(n);const k=cats.includes(String(c[7]||'spam').toLowerCase())?String(c[7]||'spam').toLowerCase():'unknown';b[k]++;}}
const community=pool.size,officialCount=official.size,mon=officialCount+community;const display=mon>=10000?'10000+':(mon>=5000?'5000+':(mon>=3000?'3000+':String(mon)));
const out={generatedAt:new Date().toISOString(),officialSuspiciousCount:officialCount,communitySignalCount:community,monitoredSignalsCount:mon,displayMonitoredSignals:display,categoryBreakdown:b,lastUpdated:new Date().toISOString()};
fs.writeFileSync(OUT,JSON.stringify(out,null,2)+'\n');
