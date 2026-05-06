#!/usr/bin/env node
const fs=require('fs');
let report, scam;
try{report=JSON.parse(fs.readFileSync('data/scrape_report.json','utf8'));}catch(e){console.error('scrape_report.json parse failed');process.exit(1);}
try{scam=JSON.parse(fs.readFileSync('scam_numbers.json','utf8'));}catch(e){console.error('scam_numbers.json parse failed');process.exit(1);}
if(!Array.isArray(scam)){console.error('scam_numbers.json is not array');process.exit(1);} 
const seen=new Set();
for(const r of scam){const n=r.number||''; if(seen.has(n)){console.error('scam_numbers.json has duplicate number');process.exit(1);} seen.add(n); if(['+52911','+52089','+52088','+52070','+52072'].includes(n)||n.startsWith('+52800')||n.startsWith('+5201800')){console.error('scam_numbers.json has banned number');process.exit(1);} }
if((report.promotedThisRun||0)>300){console.error('promotedThisRun > 300');process.exit(1);} 
if((report.acceptedCandidates||0)>1500){console.error('acceptedCandidates > 1500');process.exit(1);} 
if((report.officialAfter||0)<(report.officialBefore||0)){console.error('officialAfter < officialBefore');process.exit(1);} 
if((report.officialAfter||0)>(report.officialBefore||0)+300){console.error('officialAfter too large');process.exit(1);} 
console.log('Scrape anomaly check OK');
