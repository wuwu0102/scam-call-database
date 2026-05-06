#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const CATALOG_PATH = path.join(ROOT, 'data', 'source_catalog_mexico.json');
const PENDING_PATH = path.join(ROOT, 'data', 'pending_numbers.json');
const REPORT_PATH = path.join(ROOT, 'data', 'scrape_report.json');

const RISK_WORDS = ['extorsión','extorsion','fraude','fraudulento','falso','falsos','spam','estafa','sospechoso','reportado','reportados','denuncia','denunciado','amenaza','engaño','engano','llamadas molestas','llamadas peligrosas'];
const EXCLUDE_WORDS = ['emergencia','atención','atencion','contacto','oficina','conmutador','soporte','servicio al cliente','línea de ayuda','linea de ayuda','reporta al','llama al','comunícate','comunicate','gobierno','policía','policia','911','089'];
const BAN_SHORT = new Set(['911','089','088','070','072']);
const BAN_TEN = new Set(['0000000000','1111111111','1234567890']);

function normalize(raw) { const d = String(raw||'').replace(/\D/g,''); if (!d || BAN_SHORT.has(d)) return null; let local=null;
 if (d.startsWith('01800') || d.startsWith('01800')) return null; if (d.length===10) local=d; else if (d.length===12 && d.startsWith('52')) local=d.slice(2); else if (d.length===13 && d.startsWith('521')) local=d.slice(3);
 if (!local || !/^\d{10}$/.test(local) || BAN_TEN.has(local) || /^(\d)\1{9}$/.test(local) || local.startsWith('800')) return null; return `+52${local}`; }

function contextScore(text) {
 const t = (text||'').toLowerCase();
 let risk = 0;
 for (const w of RISK_WORDS) if (t.includes(w)) risk += 1;
 let excluded = false;
 for (const w of EXCLUDE_WORDS) if (t.includes(w)) excluded = true;
 return { risk, excluded };
}

async function main() {
 const sources = JSON.parse(fs.readFileSync(CATALOG_PATH,'utf8'));
 const pending = fs.existsSync(PENDING_PATH) ? JSON.parse(fs.readFileSync(PENDING_PATH,'utf8')) : [];
 const byNumber = new Map(pending.map((x)=>[x.number,x]));
 const report = { scrapedAt:new Date().toISOString(), totalSources:sources.length, sourcesSucceeded:0, sourcesFailed:0, rawCandidates:0, acceptedCandidates:0, pendingBefore:pending.length, pendingAfter:pending.length, newPendingThisRun:0, officialBefore:0, officialAfter:0, promotedThisRun:0, skippedReasonsSummary:{}, sources:[] };
 const skip=(r)=>{report.skippedReasonsSummary[r]=(report.skippedReasonsSummary[r]||0)+1;};

 for (const source of sources) {
  const sourceReport={name:source.name,url:source.url,fetchOk:false,htmlLength:0,rawCandidates:0,acceptedCandidates:0,skippedCandidates:0,error:null};
  try {
   const controller = new AbortController(); const timer = setTimeout(()=>controller.abort(),15000);
   const res = await fetch(source.url,{signal:controller.signal,headers:{'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'}});
   clearTimeout(timer);
   const html = await res.text();
   sourceReport.fetchOk = true; sourceReport.htmlLength = html.length;
   const regex = /(\+?52[\s\-\.]*)?(\(?\d{2,3}\)?[\s\-\.]*)?\d{3,4}[\s\-\.]?\d{3,4}/g;
   const matches = [...html.matchAll(regex)];
   sourceReport.rawCandidates = matches.length; report.rawCandidates += matches.length;
   for (const m of matches) {
    const raw = m[0]; const n = normalize(raw); if (!n) { skip('invalid_or_banned'); sourceReport.skippedCandidates += 1; continue; }
    const s = Math.max(0,m.index-80), e = Math.min(html.length,m.index+raw.length+80); const ctx = html.slice(s,e);
    const { risk, excluded } = contextScore(ctx);
    if (excluded) { skip('service_or_government_context'); sourceReport.skippedCandidates += 1; continue; }
    if (risk < 1) { skip('low_risk_context'); sourceReport.skippedCandidates += 1; continue; }
    let row = byNumber.get(n);
    if (!row) { row = { number:n, country:'MX', label:'suspicious', sources:[], evidenceCount:0, confidence:0, updatedAt:new Date().toISOString() }; byNumber.set(n,row); report.newPendingThisRun += 1; }
    if (!row.sources.find((x)=>x.url===source.url)) row.sources.push({ name:source.name, url:source.url, type:source.type, confidence:source.confidence, contextSnippet:ctx });
    row.evidenceCount = new Set(row.sources.map((x)=>x.url)).size;
    const maxConf = Math.max(...row.sources.map((x)=>Number(x.confidence)||0));
    let boost = 0; if (source.type==='community_report' && row.evidenceCount>=3) boost=0.2; else if (source.type==='community_report' && row.evidenceCount>=2) boost=0.1;
    row.confidence = Math.min(0.85, maxConf + boost); row.updatedAt = new Date().toISOString();
    sourceReport.acceptedCandidates += 1; report.acceptedCandidates += 1;
   }
   report.sourcesSucceeded += 1;
  } catch (e) { sourceReport.error = e.message; report.sourcesFailed += 1; }
  report.sources.push(sourceReport);
 }
 const pendingAfter = Array.from(byNumber.values());
 report.pendingAfter = pendingAfter.length;
 fs.writeFileSync(PENDING_PATH, JSON.stringify(pendingAfter,null,2)+'\n');
 fs.writeFileSync(REPORT_PATH, JSON.stringify(report,null,2)+'\n');
 console.log(`Scrape complete: accepted=${report.acceptedCandidates}, failedSources=${report.sourcesFailed}`);
}
main();
