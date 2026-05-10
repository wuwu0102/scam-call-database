const fs=require('fs');
const target=Number((process.argv.find(a=>a.startsWith('--target='))||'').split('=')[1]||10000);
const db=JSON.parse(fs.readFileSync('scam_numbers.json','utf8'));
const ios=JSON.parse(fs.readFileSync('data/ios_numbers.json','utf8'));
const android=JSON.parse(fs.readFileSync('data/android_numbers.json','utf8'));
const stats=JSON.parse(fs.readFileSync('data/public_stats.json','utf8'));
const allowed=new Set(['suspicious','telemarketing','collection']);const old=new Set(['scam','fraud','extortion','spam','loan_offer','debt_collection','unknown_risk']);
const seen=new Set();const errs=[];
if(db.length<target)errs.push(`db below target: missing ${target-db.length}`);
for(const r of db){if(!/^52\d{10}$/.test(String(r.number||''))){errs.push(`invalid number ${r.number}`);break;}if(seen.has(r.number)){errs.push(`duplicate ${r.number}`);break;}seen.add(r.number);if(!allowed.has(r.category)||old.has(r.category)){errs.push(`invalid category ${r.category}`);break;}}
if(stats.monitoredSignalsCount!==db.length)errs.push('monitoredSignalsCount mismatch');
if(stats.totalSearchableCount!==db.length)errs.push('totalSearchableCount mismatch');
if(ios.length<Math.floor(db.length*0.95))errs.push('ios export below 95%');
if(android.length<Math.floor(db.length*0.95))errs.push('android export below 95%');
if(errs.length){console.error(errs.join('\n'));process.exit(1);}console.log('validate_database: ok');
