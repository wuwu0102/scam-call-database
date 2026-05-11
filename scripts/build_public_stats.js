const fs=require('fs');
const {normalizeCategory,labelForCategory}=require('./lib/category_normalizer');
const {normalizeMexicoPhone}=require('./lib/phone_normalizer');
const db=JSON.parse(fs.readFileSync('scam_numbers.json','utf8'));
const dedup=new Map();
for(const r of db){const n=normalizeMexicoPhone(r.number);if(!n)continue;const c=normalizeCategory(r.category||r.label||'',r.label||'');dedup.set(n,{number:n,category:c,label:labelForCategory(c),sourceName:r.sourceName||'seed',sourceUrl:r.sourceUrl||'',confidence:Number(r.confidence||0.25),reviewStatus:r.reviewStatus||'auto',updatedAt:r.updatedAt||new Date().toISOString().slice(0,10)});} 
const normalized=[...dedup.values()];
fs.writeFileSync('data/ios_numbers.json',JSON.stringify(normalized,null,2)+'\n');
fs.writeFileSync('data/android_numbers.json',JSON.stringify(normalized,null,2)+'\n');
const cc={suspicious:0,telemarketing:0,collection:0};for(const r of normalized)cc[r.category]++;
let old={};try{old=JSON.parse(fs.readFileSync('data/public_stats.json','utf8'));}catch{}
const searchableCount = db.length;
const out={...old,monitoredSignalsCount:searchableCount,totalSearchableCount:searchableCount,iosExportCount:normalized.length,androidExportCount:normalized.length,categoryCounts:cc,lastUpdated:new Date().toISOString()};
fs.writeFileSync('data/public_stats.json',JSON.stringify(out,null,2)+'\n');
console.log(`public_stats updated: searchable=${searchableCount} ios_android=${normalized.length}`);
