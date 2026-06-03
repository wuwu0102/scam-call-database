const fs = require('fs');
const path = require('path');
const { normalizeMXNumber, isInvalidNumber, isHttpUrl } = require('./data_rules');

const OUT = path.join(__dirname, '..', 'data', 'ios_numbers.json');
const CANDIDATES = [
  path.join(__dirname, '..', 'data', 'collected_mexico_numbers.json'),
  path.join(__dirname, '..', 'data', 'mexico_seed_phone_numbers.json')
];
const TEST = new Set(['0000000000','1111111111','1234567890','5555555555','9999999999','2025550101','2025550102','2025550103','2025550104','2025550105']);
const IOS_LABELS = { scam:'Posible fraude', telemarketing:'Telemarketing', debt_collection:'Cobranza', harassment:'Acoso', unknown:'Número desconocido' };
const iosLabel=(r)=>IOS_LABELS[String(r.category||r.tag||'unknown').toLowerCase()]||IOS_LABELS.unknown;
const read=(p)=>fs.existsSync(p)?JSON.parse(fs.readFileSync(p,'utf8')):[];
const ok=(r)=>{ const n=normalizeMXNumber(r.normalizedNumber||r.number||''); const tag=String(r.tag||'').toLowerCase(); const c=String(r.confidence||'').toLowerCase(); if(!/^\d{10}$/.test(n)||isInvalidNumber(n)||TEST.has(n)) return false; if((tag==='scam'&&['high','medium'].includes(c))||(tag==='suspicious'&&c==='medium')){} else return false; if(String(r.type||'')==='crowd'&&c==='low') return false; if(!isHttpUrl(String(r.sourceUrl||'https://fallback.local').replace('https://fallback.local','https://example.com'))) return false; return true; };
const fail=(message)=>{ console.error(message); process.exitCode=1; };
const initFirebaseAdmin=()=>{
  const admin=require('firebase-admin');
  if(admin.apps.length) return admin;

  const raw=process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if(raw){
    admin.initializeApp({credential:admin.credential.cert(JSON.parse(raw))});
    console.log('Firebase credentials source: FIREBASE_SERVICE_ACCOUNT_JSON');
    return admin;
  }

  if(process.env.GOOGLE_APPLICATION_CREDENTIALS){
    admin.initializeApp({credential:admin.credential.applicationDefault()});
    console.log('Firebase credentials source: GOOGLE_APPLICATION_CREDENTIALS');
    return admin;
  }

  return null;
};
const loadFirestoreRecords=async()=>{
  const admin=initFirebaseAdmin();
  if(!admin) return null;

  const records=[];
  const s=await admin.firestore().collection('phone_numbers').get();
  s.forEach(d=>records.push(d.data()||{}));
  console.log(`Firestore records read: ${records.length}`);
  return records;
};
(async()=>{
  const requireFirestore=String(process.env.EXPORT_IOS_REQUIRE_FIRESTORE||'').toLowerCase()==='true';
  let records=[];
  let source='local fallback';

  try {
    const firestoreRecords=await loadFirestoreRecords();
    if(firestoreRecords){
      records=firestoreRecords;
      source='Firestore';
    }
  } catch(err){
    if(requireFirestore){
      fail(`Firestore export required but Firebase initialization/read failed: ${err.message}`);
      return;
    }
    console.warn(`Firebase initialization/read failed; using local fallback: ${err.message}`);
  }

  if(requireFirestore && source!=='Firestore'){
    fail('Firestore export required but no Firebase credentials were provided');
    return;
  }
  if(requireFirestore && !records.length){
    fail('Firestore export required but Firestore returned 0 phone_numbers records');
    return;
  }

  if (!records.length) records = read(CANDIDATES[0]);
  if (!records.length) records = read(CANDIDATES[1]);
  const map=new Map();
  for(const r of records){ if(!ok(r)) continue; const n=normalizeMXNumber(r.normalizedNumber||r.number||''); map.set(Number(n), { number:Number(n), label:iosLabel(r), updatedAt:r.updatedAt||'' }); }
  const out=Array.from(map.values()).sort((a,b)=>a.number-b.number);
  const counts=out.reduce((acc,r)=>{ acc[r.label]=(acc[r.label]||0)+1; return acc; },{});
  fs.writeFileSync(OUT, `${JSON.stringify(out,null,2)}\n`);
  console.log(`Export source: ${source}`);
  console.log(`Exported ${out.length}`);
  console.log(`Category counts: ${JSON.stringify(counts)}`);
})();
