const fs=require('fs');
const {getHtml,extract}=require('./lib/source_fetchers');
const catalog=JSON.parse(fs.readFileSync('data/source_catalog_mexico.json','utf8')).filter(s=>s.autoPromote!==false);
(async()=>{const rows=[];for(const s of catalog){const urls=s.urls?.slice(0,10)||[s.url];for(const u of urls.slice(0,10)){const r=await getHtml(u);const hits=r.ok?(r.html.match(/(\+?52\s?\d{2,3}[\s-]?\d{3,4}[\s-]?\d{4}|\b\d{2}[\s-]\d{4}[\s-]\d{4}\b|\b\d{3}[\s-]\d{3}[\s-]\d{4}\b)/g)||[]):[];const valid=r.ok?extract(r.html,s,u).length:0;rows.push({source:s.name,url:u,status:r.status||0,hits:hits.length,valid});}}
fs.writeFileSync('data/smoke_test_report.json',JSON.stringify({generatedAt:new Date().toISOString(),rows},null,2)+'\n');
const okSources=[...new Set(rows.filter(r=>r.valid>0).map(r=>r.source))];console.log(JSON.stringify({sourcesTested:[...new Set(rows.map(r=>r.source))].length,okSources:okSources.length},null,2));
if(process.env.CI&&okSources.length===0)console.warn('warning: no source yielded valid numbers (network may be blocked)');})();
