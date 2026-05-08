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
 if (d.startsWith('01800')) return null; if (d.length===10) local=d; else if (d.length===12 && d.startsWith('52')) local=d.slice(2); else if (d.length===13 && d.startsWith('521')) local=d.slice(3);
 if (!local || !/^\d{10}$/.test(local) || BAN_TEN.has(local) || /^(\d)\1{9}$/.test(local) || local.startsWith('800')) return null; return `+52${local}`; }

function contextScore(text) { const t=(text||'').toLowerCase(); return { risk:RISK_WORDS.reduce((a,w)=>a+(t.includes(w)?1:0),0), excluded:EXCLUDE_WORDS.some((w)=>t.includes(w))}; }

(async () => {
  const sourcesRaw = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
  const sources = sourcesRaw.slice().sort((a,b)=>(a.priority??99)-(b.priority??99) || String(a.name).localeCompare(String(b.name)));
  const pending = fs.existsSync(PENDING_PATH) ? JSON.parse(fs.readFileSync(PENDING_PATH,'utf8')) : [];
  const byNumber = new Map(pending.map((x)=>[x.number,x]));
  const report = { priorityStrategy:'GDL/Jalisco first, then CDMX, then major cities by population/usefulness', scrapedAt:new Date().toISOString(), totalSources:sources.length, sourcesSucceeded:0, sourcesFailed:0, rawCandidates:0, acceptedCandidates:0, pendingBefore:pending.length, pendingAfter:pending.length, newPendingThisRun:0, officialBefore:0, officialAfter:0, promotedThisRun:0, skippedReasonsSummary:{}, sources:[] };
  const regex = /(\+?52[\s\-\.]*)?(\(?\d{2,3}\)?[\s\-\.]*)?\d{3,4}[\s\-\.]?\d{3,4}/g;

  const skip = (k) => { report.skippedReasonsSummary[k] = (report.skippedReasonsSummary[k]||0)+1; };
  for (const source of sources) {
    const sr = {name:source.name,url:source.url,type:source.type,region:source.region,priority:source.priority,fetchOk:false,htmlLength:0,rawCandidates:0,acceptedCandidates:0,skippedCandidates:0,error:null};
    try {
      const controller = new AbortController(); const timer = setTimeout(()=>controller.abort(), 15000);
      const res = await fetch(source.url, {signal: controller.signal, headers:{'User-Agent':'Mozilla/5.0'}}); clearTimeout(timer);
      const html = await res.text(); sr.fetchOk=true; sr.htmlLength=html.length;
      const matches = [...html.matchAll(regex)]; sr.rawCandidates=matches.length; report.rawCandidates += matches.length;
      for (const m of matches) {
        const raw = m[0], n = normalize(raw); if (!n) { sr.skippedCandidates++; skip('invalid_or_banned'); continue; }
        const ctx = html.slice(Math.max(0,m.index-80), Math.min(html.length,m.index+raw.length+80));
        const {risk, excluded} = contextScore(ctx);
        if (excluded) { sr.skippedCandidates++; skip('service_or_government_context'); continue; }
        if (risk < 1) { sr.skippedCandidates++; skip('low_risk_context'); continue; }
        let row = byNumber.get(n);
        if (!row) { row = { number:n, country:'MX', label:'suspicious', sources:[], evidenceCount:0, confidence:0, updatedAt:new Date().toISOString() }; byNumber.set(n,row); report.newPendingThisRun++; }
        if (!row.sources.find((x)=>x.url===source.url)) row.sources.push({ name:source.name, url:source.url, type:source.type, confidence:source.confidence, contextSnippet:ctx });
        row.evidenceCount = new Set(row.sources.map((x)=>x.url)).size;
        const maxConf = Math.max(...row.sources.map((x)=>Number(x.confidence)||0));
        const hasCommunity = row.sources.some((x)=>x.type==='community_report');
        let boost = 0; if (hasCommunity && row.evidenceCount>=3) boost=0.2; else if (hasCommunity && row.evidenceCount>=2) boost=0.1;
        row.confidence = Math.min(0.85, maxConf + boost); row.updatedAt = new Date().toISOString();
        sr.acceptedCandidates++; report.acceptedCandidates++;
      }
      report.sourcesSucceeded++;
    } catch (e) { sr.error=String(e.message||e); report.sourcesFailed++; }
    report.sources.push(sr);
  }

  const pendingAfter = Array.from(byNumber.values()); report.pendingAfter = pendingAfter.length;
  fs.writeFileSync(PENDING_PATH, JSON.stringify(pendingAfter,null,2)+'\n');
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report,null,2)+'\n');
  console.log(`Scrape complete: accepted=${report.acceptedCandidates}, failedSources=${report.sourcesFailed}`);
})();
