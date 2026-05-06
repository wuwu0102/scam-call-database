#!/usr/bin/env node
const fs=require('fs');
const scam=JSON.parse(fs.readFileSync('scam_numbers.json','utf8'));
if(!Array.isArray(scam)) throw new Error('scam_numbers.json must be array');
const seen=new Set();
for(const r of scam){const n=r.number||''; if(!/^\+52\d{10}$/.test(n)) throw new Error(`bad number ${n}`); if(seen.has(n)) throw new Error(`duplicate ${n}`); seen.add(n); if(['911','089','088','070','072'].includes(n.slice(3))||n.startsWith('+52800')||n.startsWith('+5201800')) throw new Error(`banned ${n}`);} 
if(fs.existsSync('data/pending_numbers.json')) JSON.parse(fs.readFileSync('data/pending_numbers.json','utf8'));
if(fs.existsSync('data/scrape_report.json')) JSON.parse(fs.readFileSync('data/scrape_report.json','utf8'));
console.log('Database safety check OK');
