#!/usr/bin/env node
const fs=require('fs');const path=require('path');
const ROOT=process.cwd();
const BULK=path.join(ROOT,'data','community_bulk_import_numbers.csv');const PENDING=path.join(ROOT,'data','pending_numbers.json');const SCAM=path.join(ROOT,'scam_numbers.json');const SNAP_DIR=path.join(ROOT,'data','community_source_snapshots');const REPORT=path.join(ROOT,'data','community_signal_pool_report.json');
const HEADER='number,label,sourceName,sourceUrl,region,note,confidence,category';const target=3000;const cats=['spam','telemarketing','cobranza','publicidad','robocall','scam','fraud','extortion','unknown'];
const parse=(l)=>{const o=[];let c='',q=false;for(let i=0;i<l.length;i++){const ch=l[i];if(ch==='"'){if(q&&l[i+1]==='"'){c+='"';i++;}else q=!q;}else if(ch===','&&!q){o.push(c);c='';}else c+=ch;}o.push(c);return o;};
const toLine=(r)=>r.map(v=>{const t=String(v??'');return /[",\n]/.test(t)?`"${t.replace(/"/g,'""')}"`:t;}).join(',');
const norm=(raw)=>{const d=String(raw||'').replace(/\D/g,'');if(d.length===10)return '+52'+d;if(d.length===12&&d.startsWith('52'))return '+'+d;if(d.length===13&&d.startsWith('521'))return '+52'+d.slice(3);return null;};
const safeArr=(p)=>fs.existsSync(p)?JSON.parse(fs.readFileSync(p,'utf8')):[];
const scam=safeArr(SCAM);const official=new Set((Array.isArray(scam)?scam:[]).map(x=>x.number).filter(Boolean));
let bulkRows=[];if(fs.existsSync(BULK)){const lines=fs.readFileSync(BULK,'utf8').split(/\r?\n/).filter(Boolean);if(lines.length&&parse(lines[0]).length>=7){for(let i=1;i<lines.length;i++){const c=parse(lines[i]);const n=norm(c[0]);if(!n)continue;bulkRows.push(c.length>=8?c:[c[0],c[1],c[2],c[3],c[4],c[5],c[6],'spam']);}}}
const pending=Array.isArray(safeArr(PENDING))?safeArr(PENDING):[];
const snapRows=[];if(fs.existsSync(SNAP_DIR)){for(const f of fs.readdirSync(SNAP_DIR).filter(x=>x.endsWith('.csv'))){const lines=fs.readFileSync(path.join(SNAP_DIR,f),'utf8').split(/\r?\n/).filter(Boolean);for(let i=1;i<lines.length;i++){const c=parse(lines[i]);if(c.length<7)continue;snapRows.push(c.length>=8?c:[c[0],c[1],c[2],c[3],c[4],c[5],c[6],'spam']);}}}
const pool=new Set();const catBreak=Object.fromEntries(cats.map(c=>[c,0]));
const add=(n,cat)=>{if(!n||official.has(n))return;pool.add(n);const k=cats.includes(cat)?cat:'unknown';catBreak[k]+=1;};
pending.forEach(r=>add(norm(r.number),String(r.category||'unknown').toLowerCase()));bulkRows.forEach(r=>add(norm(r[0]),String(r[7]||'spam').toLowerCase()));snapRows.forEach(r=>add(norm(r[0]),String(r[7]||'spam').toLowerCase()));
let added=0,dup=0,skipOff=0,skipInvalid=0;const bulkSet=new Set(bulkRows.map(r=>norm(r[0])).filter(Boolean));
if(pool.size<target){for(const r of snapRows){const n=norm(r[0]);if(!n){skipInvalid++;continue;}if(official.has(n)){skipOff++;continue;}if(bulkSet.has(n)){dup++;continue;}bulkSet.add(n);bulkRows.push([n,'suspicious',r[2]||'',r[3]||'',r[4]||'México',r[5]||'Reporte comunitario',String(r[6]||0.35),cats.includes(String(r[7]).toLowerCase())?String(r[7]).toLowerCase():'spam']);added++;add(n,String(r[7]||'spam').toLowerCase());if(pool.size>=target)break;}}
fs.writeFileSync(BULK,HEADER+'\n'+bulkRows.map(toLine).join('\n')+'\n');
const report={generatedAt:new Date().toISOString(),target,officialCount:official.size,pendingCount:pending.length,communityBulkCount:bulkSet.size,snapshotCount:new Set(snapRows.map(r=>norm(r[0])).filter(Boolean)).size,communitySignalPoolCount:pool.size,remainingGap:Math.max(0,target-pool.size),addedToBulkFromSnapshots:added,skippedDuplicates:dup,skippedOfficialExisting:skipOff,skippedInvalid:skipInvalid,categoryBreakdown:catBreak,sourcesUsed:[...new Set(snapRows.map(r=>r[2]).filter(Boolean))]};
fs.writeFileSync(REPORT,JSON.stringify(report,null,2)+'\n');
