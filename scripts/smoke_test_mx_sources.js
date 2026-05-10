const fs=require('fs');
const {getHtml,extract}=require('./lib/source_fetchers');
const catalog=JSON.parse(fs.readFileSync('data/source_catalog_mexico.json','utf8'));
(async()=>{
  for(const s of catalog){
    const r=await getHtml(s.url);
    if(!r.ok){console.log(`[warn] ${s.name} status=${r.status||0} regexHits=0 validNormalized=0`);continue;}
    const hits=(String(r.html).match(/(\+?52\D*\d{10}|\b\d{10}\b)/g)||[]).length;
    const valid=extract(r.html,s,s.url).length;
    console.log(`[ok] ${s.name} status=${r.status} regexHits=${hits} validNormalized=${valid}`);
  }
})();
