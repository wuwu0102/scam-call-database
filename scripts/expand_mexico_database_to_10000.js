const fs=require('fs');const path=require('path');
const {normalizeCategory,labelForCategory}=require('./lib/category_normalizer');
const {normalizeMexicoPhone}=require('./lib/phone_normalizer');
const {fetchGenericHtmlPhones,fetchQuienHablaLadaPages,fetchListaSpamPages}=require('./lib/source_fetchers');
const target=Number((process.argv.find(a=>a.startsWith('--target='))||'').split('=')[1]||10000);
const DB='scam_numbers.json';const CAT='data/source_catalog_mexico.json';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));const write=(p,d)=>fs.writeFileSync(p,JSON.stringify(d,null,2)+'\n');
(async()=>{const db=read(DB);const catalog=read(CAT);const existed=new Set(db.map(r=>normalizeMexicoPhone(r.number)).filter(Boolean));const add=[];const today=new Date().toISOString().slice(0,10);
for(const s of catalog){if(db.length+add.length>=target)break;if(s.autoPromote===false)continue;let rows=[];if(s.fetcher==='quienhabla_lada')rows=await fetchQuienHablaLadaPages(s);else if(s.fetcher==='listaspam')rows=await fetchListaSpamPages(s);else rows=await fetchGenericHtmlPhones(s);let n=0;for(const r of rows){if(db.length+add.length>=target||n>=1000)break;const number=normalizeMexicoPhone(r.number);if(!number||existed.has(number))continue;const category=normalizeCategory(r.category||s.defaultCategory||'',r.snippet||'');add.push({number,category,label:labelForCategory(category),sourceName:s.name,sourceUrl:r.sourceUrl||s.url||'',confidence:Number(s.confidence||0.25),reviewStatus:'auto',updatedAt:today});existed.add(number);n++;}}
if(add.length){write(DB,db.concat(add));}
const after=db.length+add.length;const missing=Math.max(0,target-after);console.log(JSON.stringify({before:db.length,after,added:add.length,missing}));if(missing>0)process.exitCode=2;})();
