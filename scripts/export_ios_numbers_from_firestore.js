const fs = require('fs');
const path = require('path');
const { normalizeMXNumber, isInvalidNumber, isHttpUrl } = require('./data_rules');

const OUT = path.join(__dirname, '..', 'data', 'ios_numbers.json');
const CANDIDATES = [
  path.join(__dirname, '..', 'data', 'collected_mexico_numbers.json'),
  path.join(__dirname, '..', 'data', 'mexico_seed_phone_numbers.json')
];
const TEST = new Set(['0000000000','1111111111','1234567890','5555555555','9999999999','2025550101','2025550102','2025550103','2025550104','2025550105']);
const read=(p)=>fs.existsSync(p)?JSON.parse(fs.readFileSync(p,'utf8')):[];
const ok=(r)=>{ const n=normalizeMXNumber(r.normalizedNumber||r.number||''); const tag=String(r.tag||'').toLowerCase(); const c=String(r.confidence||'').toLowerCase(); if(!/^\d{10}$/.test(n)||isInvalidNumber(n)||TEST.has(n)) return false; if((tag==='scam'&&['high','medium'].includes(c))||(tag==='suspicious'&&c==='medium')){} else return false; if(String(r.type||'')==='crowd'&&c==='low') return false; if(!isHttpUrl(String(r.sourceUrl||'https://fallback.local').replace('https://fallback.local','https://example.com'))) return false; return true; };
(async()=>{ let records=[]; try { const raw=process.env.FIREBASE_SERVICE_ACCOUNT_JSON; if(raw){ const admin=require('firebase-admin'); if(!admin.apps.length) admin.initializeApp({credential:admin.credential.cert(JSON.parse(raw))}); const s=await admin.firestore().collection('phone_numbers').get(); s.forEach(d=>records.push(d.data()||{})); } } catch(_){}
  if (!records.length) records = read(CANDIDATES[0]);
  if (!records.length) records = read(CANDIDATES[1]);
  const map=new Map();
  for(const r of records){ if(!ok(r)) continue; const n=normalizeMXNumber(r.normalizedNumber||r.number||''); map.set(Number(n), { number:Number(n), label:String(r.tag).toLowerCase()==='scam'?'Posible fraude':'Número sospechoso', updatedAt:r.updatedAt||'' }); }
  const out=Array.from(map.values()).sort((a,b)=>a.number-b.number);
  fs.writeFileSync(OUT, `${JSON.stringify(out,null,2)}\n`);
  console.log(`Exported ${out.length}`);
})();
