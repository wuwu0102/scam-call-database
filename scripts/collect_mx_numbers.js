const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const PENDING_PATH = path.join(DATA_DIR, 'pending_numbers.json');
const MANUAL_CSV_PATH = path.join(DATA_DIR, 'manual_import_numbers.csv');
const SEED_CSV_PATH = path.join(DATA_DIR, 'seed_verified_public_numbers.csv');
const COLLECTION_REPORT_PATH = path.join(DATA_DIR, 'collection_report.json');

const SOURCE_CONFIDENCE_MAP = {
  official_federal: 0.9,
  official_state: 0.85,
  official_state_lookup: 0.8,
  official_state_announcement: 0.8,
  official_state_app_reference: 0.75,
  municipal_public_report: 0.65,
  financial_fraud: 0.85,
  manual_import: 0.5,
  news_or_public_reference: 0.45,
  public_report: 0.4,
};

const RISK_KEYWORDS = [
  'extorsión', 'extorsion', 'extorsionador', 'extorsionadores', 'fraude', 'fraudulento', 'falso', 'falsos',
  'números utilizados', 'numeros utilizados', 'llamadas desde', 'reportados', 'denunciados', 'alerta', 'amenaza', 'engaño', 'engano',
];
const HARD_RISK_OVERRIDE = [
  'extorsionador', 'extorsionadores', 'números utilizados', 'numeros utilizados',
  'líneas utilizadas', 'lineas utilizadas', 'llamadas desde', 'reportados como extorsión', 'reportados como extorsion',
];
const EXCLUSION_KEYWORDS = [
  'emergencia', 'denuncia', 'atención', 'atencion', 'contacto', 'oficina', 'conmutador', 'línea de ayuda', 'linea de ayuda',
  'reporta al', 'llama al', 'comunícate', 'comunicate', '911', '089', '088', '800', '01 800',
];

const SOURCES = [
  { name: 'Baja California Seguridad', url: 'https://seguridadbc.gob.mx/ExtorsionTelefonica/index.php', type: 'official_state', mode: 'list_scrape', confidence: 0.85 },
  { name: 'Baja California Engaño', url: 'https://www.seguridadbc.gob.mx/ExtorsionTelefonica/engano.php', type: 'official_state', mode: 'list_scrape', confidence: 0.85 },
  { name: 'Baja California Legacy Engaño', url: 'https://www.seguridadbc.gob.mx/contenidos/engano.php', type: 'official_state', mode: 'announcement_scrape', confidence: 0.75 },
  { name: 'SAT Números telefónicos falsos', url: 'https://www.gob.mx/sat/acciones-y-programas/numeros-telefonicos-falsos', type: 'official_federal', mode: 'list_scrape', confidence: 0.9 },
  { name: 'SAT Correos falsos identificados', url: 'https://www.gob.mx/sat/acciones-y-programas/correos-falsos-identificados', type: 'official_federal', mode: 'announcement_scrape', confidence: 0.75 },
  { name: 'Chihuahua Consulta Extorsión', url: 'https://fgewebapps.chihuahua.gob.mx/consultaextorsion', type: 'official_state_lookup', mode: 'lookup_source', confidence: 0.8 },
  { name: 'Tamaulipas Consulta de Números de Extorsión', url: 'https://www.tamaulipas.gob.mx/sesesp/consulta-de-numeros-de-extorsion/', type: 'official_state_lookup', mode: 'lookup_source', confidence: 0.8 },
  { name: 'Guanajuato Consulta de Reportes de Extorsión', url: 'https://seguridad.guanajuato.gob.mx/c5i/consulta-de-reportes-de-extorsion/', type: 'official_state_lookup', mode: 'lookup_source', confidence: 0.8 },
  { name: 'Aguascalientes C5i Búsqueda de Números de Extorsión', url: 'https://c5i.aguascalientes.gob.mx/sistemas/extorsiones', type: 'official_state_lookup', mode: 'lookup_source', confidence: 0.8 },
  { name: 'Tlaxcala Números de Extorsión', url: 'https://ssctlaxcala.gob.mx/numeros', type: 'official_state_lookup', mode: 'captcha_lookup_source', confidence: 0.75 },
  { name: 'Veracruz C4 Extorsión / Engaño Telefónico', url: 'https://www.c4ver.gob.mx/extorsion.html', type: 'official_state_lookup', mode: 'lookup_source', confidence: 0.8 },
  { name: 'Sonora Gobierno Antiextorsión', url: 'https://www.sonora.gob.mx/gobierno/acciones/dependencias/exhorta-gobierno-de-sonora-a-no-responder-llamadas-de-numeros-identificados-como-extorsionadores', type: 'official_state_announcement', mode: 'announcement_scrape', confidence: 0.75 },
  { name: 'Campeche 0 Extorsión 911', url: 'https://www.cespcampeche.gob.mx/web/public/0extorsion911', type: 'official_state_app_reference', mode: 'announcement_scrape', confidence: 0.75 },
  { name: 'Coatzacoalcos Reporte Ciudadano de Números de Extorsión', url: 'https://dex.coatzacoalcos.gob.mx/', type: 'municipal_public_report', mode: 'lookup_source', confidence: 0.65 },
  { name: 'Zacatecas SSP Alerta', url: 'https://ssp.zacatecas.gob.mx/alerta-ssp-sobre-numeros-telefonicos-utilizados-para-extorsionar/', type: 'official_state_announcement', mode: 'announcement_scrape', confidence: 0.8 },
  { name: 'Zacatecas SSP Modalidad', url: 'https://ssp.zacatecas.gob.mx/detecta-ssp-modalidad-de-extorsion-telefonica-7/', type: 'official_state_announcement', mode: 'announcement_scrape', confidence: 0.8 },
  { name: 'Zapopan Gobierno Fraude', url: 'https://www.zapopan.gob.mx/gobierno/seguridad/fraude-y-extorsion-telefonica/', type: 'official_state', mode: 'announcement_scrape', confidence: 0.8 },
  { name: 'Colima Gobierno Noticia', url: 'https://www.col.gob.mx/Portal/detalle_noticia/NjAwNTI%3D', type: 'official_state', mode: 'announcement_scrape', confidence: 0.8 },
  { name: 'SEGOB Extorsión', url: 'https://www.gob.mx/segob/articulos/evita-ser-victima-de-la-extorsion-telefonica?es-MX=', type: 'official_federal', mode: 'announcement_scrape', confidence: 0.9 },
  { name: 'Policía Federal Qué es extorsión', url: 'https://www.gob.mx/epn/policiafederal/articulos/que-es-la-extorsion?idiom=es', type: 'official_federal', mode: 'announcement_scrape', confidence: 0.9 },
  { name: 'Policía Federal Tipos extorsión', url: 'https://www.gob.mx/epn/policiafederal/articulos/conoce-los-tipos-de-extorsion?idiom=es', type: 'official_federal', mode: 'announcement_scrape', confidence: 0.9 },
  { name: 'Manual Import CSV', file: 'data/manual_import_numbers.csv', type: 'manual_import', mode: 'csv_import', confidence: 0.5 },
  { name: 'Seed Verified Public CSV', file: 'data/seed_verified_public_numbers.csv', type: 'official_state_announcement', mode: 'seed_csv_import', confidence: 0.8 },
];

async function fetchHtml(url) { const c = new AbortController(); const t = setTimeout(() => c.abort(), 15000); try { const r = await fetch(url,{signal:c.signal,headers:{'User-Agent':'scam-call-database-mx-collector/2.0',Accept:'text/html,application/xhtml+xml'}}); if(!r.ok) throw new Error(`HTTP ${r.status}`); return await r.text(); } finally { clearTimeout(t);} }

function normalizeMXNumber(raw){ if(!raw) return ''; let d=String(raw).replace(/\D/g,''); if (/^(911|089|088|070|072)$/.test(d)) return ''; if (d.startsWith('521')&&d.length>=13) d=d.slice(3); else if (d.startsWith('52')&&d.length>=12) d=d.slice(2); else if (d.startsWith('01800')) return ''; if (d.length!==10 && d.length>10) d=d.slice(-10); if (d.length!==10) return ''; return `+52${d}`; }
function isEmergencyOrServiceLocal(local){ return /^(911|089|088|070|072)$/.test(local) || local.startsWith('800') || local.startsWith('1800') || local.startsWith('01800'); }
function isValidMXNumber(number){ if(!/^\+52\d{10}$/.test(number)) return false; const local=number.slice(3); if(['0000000000','1111111111','1234567890'].includes(local)) return false; if(/^([0-9])\1{9}$/.test(local)) return false; if(isEmergencyOrServiceLocal(local)) return false; return true; }

function extractPhoneCandidatesWithContext(text){ if(!text) return []; const out=[]; const re=/(\+?52[\s\-\.]*)?(\(?\d{2,3}\)?[\s\-\.]*)?\d{3,4}[\s\-\.]?\d{4}|\b\d{10}\b/g; let m; while((m=re.exec(text))){ const raw=(m[0]||'').trim(); const normalized=normalizeMXNumber(raw); const s=Math.max(0,m.index-50); const e=Math.min(text.length,m.index+raw.length+50); const ctx=text.slice(s,e).toLowerCase(); const contextBefore=text.slice(s,m.index); const contextAfter=text.slice(m.index+raw.length,e); let risk=0; for(const k of RISK_KEYWORDS){ if(ctx.includes(k)) risk+=1; } let skipReason=''; const hasExcl=EXCLUSION_KEYWORDS.find((k)=>ctx.includes(k)); const hasOverride=HARD_RISK_OVERRIDE.some((k)=>ctx.includes(k)); if(!normalized) skipReason='normalization_failed'; else if(!isValidMXNumber(normalized)) skipReason='invalid_or_service_number'; else if(hasExcl && !hasOverride) skipReason=`excluded_context:${hasExcl}`; else if(risk===0) skipReason='missing_risk_context'; out.push({raw,normalized,contextBefore,contextAfter,riskContextScore:risk,skipReason}); }
 return out; }

function parseCsvLine(line){ const out=[]; let c=''; let q=false; for(let i=0;i<line.length;i++){ const ch=line[i]; if(ch==='"'){ if(q && line[i+1]==='"'){c+='"';i++;} else q=!q;} else if(ch===','&&!q){out.push(c);c='';} else c+=ch;} out.push(c); return out; }
function readCsvSafe(file, header){ if(!fs.existsSync(file)) fs.writeFileSync(file, `${header}\n`, 'utf8'); const lines=fs.readFileSync(file,'utf8').split(/\r?\n/).filter((l)=>l.trim()); return lines.length>1 ? lines.slice(1).map(parseCsvLine) : []; }

function buildRecord({ number, source, confidence, collectedAt, note = '', status = 'pending_review', sourceType, sourceUrl, sourceName }) { return { number, label:'suspicious', country:'MX', sourceType: sourceType || source.type, sourceName: sourceName || source.name, sourceUrl: sourceUrl || source.url, confidence, status, evidenceCount:1, skipReason:'', sources:[{sourceName:sourceName||source.name,sourceType:sourceType||source.type,sourceUrl:sourceUrl||source.url,confidence,mode:source.mode,collectedAt}], firstSeenAt:collectedAt, updatedAt:collectedAt, note }; }

async function collectFromSource(source){ const collectedAt=new Date().toISOString(); const records=[]; const report={name:source.name,mode:source.mode,fetchOk:false,htmlLength:0,rawMatches:0,acceptedCandidates:0,skippedCandidates:0,skippedReasonsSummary:{},error:null};
 try {
  if(source.mode==='csv_import'){ const rows=readCsvSafe(MANUAL_CSV_PATH,'number,label,source,note'); report.rawMatches=rows.length; for(const row of rows){ const n=normalizeMXNumber(row[0]); if(!isValidMXNumber(n)){ report.skippedCandidates++; report.skippedReasonsSummary.invalid_csv_number=(report.skippedReasonsSummary.invalid_csv_number||0)+1; continue;} records.push(buildRecord({number:n,source,confidence:0.5,collectedAt,note:row[3]||''})); } report.fetchOk=true; report.acceptedCandidates=records.length; return {records,report}; }
  if(source.mode==='seed_csv_import'){ const rows=readCsvSafe(SEED_CSV_PATH,'number,label,sourceName,sourceUrl,note,confidence'); report.rawMatches=rows.length; for(const row of rows){ const [num,label='suspicious',sName='',sUrl='',note='',c='0.8']=row; const conf=Number(c||0); const n=normalizeMXNumber(num); if(!isValidMXNumber(n) || conf<0.8){ report.skippedCandidates++; report.skippedReasonsSummary.invalid_or_low_confidence_seed=(report.skippedReasonsSummary.invalid_or_low_confidence_seed||0)+1; continue; } const rec=buildRecord({number:n,source,confidence:conf,collectedAt,note, status:'auto_approved_public_official', sourceType:'official_state_announcement', sourceName:sName||source.name, sourceUrl:sUrl||source.url}); rec.label=label||'suspicious'; records.push(rec);} report.fetchOk=true; report.acceptedCandidates=records.length; return {records,report}; }

  const html=await fetchHtml(source.url); report.fetchOk=true; report.htmlLength=html.length; const candidates=extractPhoneCandidatesWithContext(html); report.rawMatches=candidates.length;
  for(const c of candidates){ if(c.skipReason){ report.skippedCandidates++; report.skippedReasonsSummary[c.skipReason]=(report.skippedReasonsSummary[c.skipReason]||0)+1; continue; } records.push(buildRecord({number:c.normalized,source,confidence:source.confidence,collectedAt,note:`riskContextScore=${c.riskContextScore}`})); }
  report.acceptedCandidates=records.length;
 } catch (error) { report.error=error.message; }
 return {records,report}; }

function calculateConfidence(item){ const sc=(item.sources||[]).map((s)=>Number(s.confidence||SOURCE_CONFIDENCE_MAP[s.sourceType]||0)); const base=sc.length?Math.max(...sc):Number(item.confidence||0); const ev=item.evidenceCount||sc.length||1; const boost=ev>=3?0.1:ev>=2?0.05:0; return Math.min(0.95,Number((base+boost).toFixed(2))); }
function safeReadJsonArray(file){ try { if(!fs.existsSync(file)) return []; const parsed=JSON.parse(fs.readFileSync(file,'utf8')); return Array.isArray(parsed)?parsed:[]; } catch { return []; } }
function mergeWithExistingPending(newItems){ const now=new Date().toISOString(); const by=new Map(); for(const item of safeReadJsonArray(PENDING_PATH)){ if(item&&item.number) by.set(item.number,item);} for(const incoming of newItems){ const ex=by.get(incoming.number); if(!ex){ const n={...incoming}; n.evidenceCount=(n.sources||[]).length||1; n.confidence=calculateConfidence(n); if(n.status!=='auto_approved_public_official') n.status=n.confidence>=0.85?'pending_review_high_confidence':'pending_review'; by.set(n.number,n); continue;} const smap=new Map(); [...(ex.sources||[]),...(incoming.sources||[])].forEach((s)=>smap.set(`${s.sourceUrl}::${s.sourceName}::${s.mode}`,s)); const merged={...ex,...incoming,sources:Array.from(smap.values()),firstSeenAt:ex.firstSeenAt||incoming.firstSeenAt||now,updatedAt:now,note:ex.note||incoming.note||'',skipReason:ex.skipReason||incoming.skipReason||''}; merged.evidenceCount=merged.sources.length; merged.confidence=calculateConfidence(merged); if(merged.status!=='auto_approved_public_official') merged.status=merged.confidence>=0.85?'pending_review_high_confidence':'pending_review'; by.set(merged.number,merged);} return Array.from(by.values()).sort((a,b)=>a.number.localeCompare(b.number)); }

async function run(){ const all=[]; const per=[]; let raw=0, acc=0, skip=0; for(const s of SOURCES){ const {records,report}=await collectFromSource(s); all.push(...records); raw+=report.rawMatches||0; acc+=report.acceptedCandidates||0; skip+=report.skippedCandidates||0; per.push(report); if(report.error) console.warn(`[${s.name}] failed: ${report.error}`); }
 const merged=mergeWithExistingPending(all); fs.writeFileSync(PENDING_PATH,`${JSON.stringify(merged,null,2)}\n`,'utf8'); const skippedReasonsSummary={}; per.forEach((p)=>Object.entries(p.skippedReasonsSummary||{}).forEach(([k,v])=>{skippedReasonsSummary[k]=(skippedReasonsSummary[k]||0)+v;})); const payload={collectedAt:new Date().toISOString(),totalSources:SOURCES.length,totalRawMatches:raw,totalAcceptedCandidates:acc,totalSkippedCandidates:skip,totalPendingNumbers:merged.length,previousOfficialCount:0,newOfficialCount:0,promotedThisRun:0,skippedReasonsSummary,sources:per}; fs.writeFileSync(COLLECTION_REPORT_PATH,`${JSON.stringify(payload,null,2)}\n`,'utf8'); return {merged,reportPayload:payload}; }

if(require.main===module){ run().catch((e)=>{ console.error('Collector failed unexpectedly:',e.message); process.exit(1);}); }
module.exports={SOURCES,fetchHtml,extractPhoneCandidatesWithContext,normalizeMXNumber,isValidMXNumber,collectFromSource,mergeWithExistingPending,calculateConfidence,run};
