const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const PENDING_PATH = path.join(DATA_DIR, 'pending_numbers.json');
const MANUAL_CSV_PATH = path.join(DATA_DIR, 'manual_import_numbers.csv');
const SEED_CSV_PATH = path.join(DATA_DIR, 'seed_verified_public_numbers.csv');
const COLLECTION_REPORT_PATH = path.join(DATA_DIR, 'collection_report.json');
const SCAM_PATH = path.join(__dirname, '..', 'scam_numbers.json');
const IOS_PATH = path.join(DATA_DIR, 'ios_numbers.json');

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

const RISK_KEYWORDS = ['extorsión', 'extorsion', 'fraude', 'amenaza', 'engaño', 'engano', 'denunciado', 'reportado', 'número utilizado', 'línea utilizada'];
const HARD_RISK_OVERRIDE = ['números utilizados', 'numeros utilizados', 'líneas utilizadas', 'lineas utilizadas', 'extorsionadores'];
const EXCLUSION_KEYWORDS = ['911', '089', '088', '800', '01 800', 'contacto', 'conmutador', 'oficina', 'servicio', 'atención', 'denuncia'];

const SOURCES = [
  { name: 'SAT Números telefónicos falsos', url: 'https://www.gob.mx/sat/acciones-y-programas/numeros-telefonicos-falsos', type: 'official_federal', mode: 'list_scrape', confidence: 0.9 },
  { name: 'Baja California Seguridad', url: 'https://seguridadbc.gob.mx/ExtorsionTelefonica/index.php', type: 'official_state', mode: 'list_scrape', confidence: 0.85 },
  { name: 'Baja California Engaño', url: 'https://www.seguridadbc.gob.mx/ExtorsionTelefonica/engano.php', type: 'official_state', mode: 'list_scrape', confidence: 0.85 },
  { name: 'Zacatecas SSP Alerta', url: 'https://ssp.zacatecas.gob.mx/alerta-ssp-sobre-numeros-telefonicos-utilizados-para-extorsionar/', type: 'official_state_announcement', mode: 'announcement_scrape', confidence: 0.8, announcementPages: [] },
  { name: 'Jalisco SSC Alerta', url: 'https://sspj.jalisco.gob.mx/prensa/noticia/14986', type: 'official_state_announcement', mode: 'announcement_scrape', confidence: 0.8 },
  { name: 'Gobierno Sonora extorsión', url: 'https://www.sonora.gob.mx/gobierno/acciones/dependencias/exhorta-gobierno-de-sonora-a-no-responder-llamadas-de-numeros-identificados-como-extorsionadores', type: 'official_state_announcement', mode: 'announcement_scrape', confidence: 0.8 },
  { name: 'Manual Import CSV', file: 'data/manual_import_numbers.csv', type: 'manual_import', mode: 'csv_import', confidence: 0.5 },
  { name: 'Seed Verified Public CSV', file: 'data/seed_verified_public_numbers.csv', type: 'official_state_announcement', mode: 'seed_csv_import', confidence: 0.8 },
  { name: 'Tlaxcala Números de Extorsión', url: 'https://ssctlaxcala.gob.mx/numeros', type: 'official_state_lookup', mode: 'captcha_lookup_source', confidence: 0.75 },
];

async function fetchHtml(url) { const r = await fetch(url, { headers: { 'User-Agent': 'scam-call-database-mx-collector/3.0' } }); if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.text(); }
const normalizeMXNumber = (raw) => { if (!raw) return ''; let d = String(raw).replace(/\D/g, ''); if (d.startsWith('521') && d.length >= 13) d = d.slice(3); else if (d.startsWith('52') && d.length >= 12) d = d.slice(2); if (d.startsWith('01800') || d.startsWith('1800')) return ''; if (d.length > 10) d = d.slice(-10); return /^\d{10}$/.test(d) ? `+52${d}` : ''; };
const isValidMXNumber = (n) => /^\+52\d{10}$/.test(n || '') && !/^\+52(911|089|088|070|072|800|1800|01800)/.test(n || '');

function extractPhoneCandidatesWithContext(text) {
  const out = []; if (!text) return out;
  const re = /(\+?52[\s\-.]*)?(\(?\d{2,3}\)?[\s\-.]*)?\d{3,4}[\s\-.]?\d{4}|\b\d{10}\b/g; let m;
  while ((m = re.exec(text))) {
    const raw = m[0].trim(); const normalized = normalizeMXNumber(raw);
    const s = Math.max(0, m.index - 90); const e = Math.min(text.length, m.index + raw.length + 90); const ctx = text.slice(s, e).toLowerCase();
    const risk = RISK_KEYWORDS.filter((k) => ctx.includes(k)).length;
    const excluded = EXCLUSION_KEYWORDS.find((k) => ctx.includes(k));
    const hasOverride = HARD_RISK_OVERRIDE.some((k) => ctx.includes(k));
    let skipReason = '';
    if (!normalized) skipReason = 'normalization_failed';
    else if (!isValidMXNumber(normalized)) skipReason = 'invalid_or_service_number';
    else if (excluded && !hasOverride) skipReason = `excluded_context:${excluded}`;
    else if (risk === 0) skipReason = 'missing_risk_context';
    out.push({ normalized, skipReason, riskContextScore: risk });
  }
  return out;
}

function parseCsvLine(line) { const out = []; let c = ''; let q = false; for (let i = 0; i < line.length; i++) { const ch = line[i]; if (ch === '"') { if (q && line[i + 1] === '"') { c += '"'; i++; } else q = !q; } else if (ch === ',' && !q) { out.push(c); c = ''; } else c += ch; } out.push(c); return out; }
function readCsvSafe(file, header) { if (!fs.existsSync(file)) fs.writeFileSync(file, `${header}\n`, 'utf8'); const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean); return lines.length > 1 ? lines.slice(1).map(parseCsvLine) : []; }

function buildRecord({ number, source, collectedAt, note = '', status = 'pending_review', sourceType, sourceUrl, sourceName, confidence }) {
  return { number, label: 'suspicious', country: 'MX', sourceType: sourceType || source.type, sourceName: sourceName || source.name, sourceUrl: sourceUrl || source.url, confidence, status, evidenceCount: 1, sources: [{ sourceName: sourceName || source.name, sourceType: sourceType || source.type, sourceUrl: sourceUrl || source.url, confidence, mode: source.mode, collectedAt }], firstSeenAt: collectedAt, updatedAt: collectedAt, note };
}

function extractLinks(html, baseUrl) {
  const links = new Set();
  const re = /href=["']([^"']+)["']/gi; let m;
  const base = new URL(baseUrl);
  while ((m = re.exec(html))) {
    try {
      const u = new URL(m[1], baseUrl);
      if (u.hostname === base.hostname) links.add(u.toString());
    } catch {}
  }
  return [...links].slice(0, 20);
}

async function collectFromSource(source) {
  const collectedAt = new Date().toISOString();
  const report = { name: source.name, mode: source.mode, acceptedCandidates: 0, skippedCandidates: 0, rawMatches: 0, status: 'ok', skippedReasonsSummary: {} };
  const records = [];
  if (source.mode === 'lookup_source' || source.mode === 'captcha_lookup_source') { report.status = 'manual_needed'; return { records, report }; }
  try {
    if (source.mode === 'csv_import' || source.mode === 'seed_csv_import') {
      const rows = readCsvSafe(source.mode === 'csv_import' ? MANUAL_CSV_PATH : SEED_CSV_PATH, 'number,label,sourceName,sourceUrl,note,confidence');
      report.rawMatches = rows.length;
      for (const row of rows) {
        const n = normalizeMXNumber(row[0]); const conf = Number(row[5] || source.confidence || 0.5);
        if (!isValidMXNumber(n)) { report.skippedCandidates++; report.skippedReasonsSummary.invalid_csv_number = (report.skippedReasonsSummary.invalid_csv_number || 0) + 1; continue; }
        const isManual = source.mode === 'csv_import';
        records.push(buildRecord({ number: n, source, collectedAt, status: isManual ? 'pending_review' : 'auto_approved_public_official', sourceName: row[2] || source.name, sourceUrl: row[3] || source.url, confidence: conf, note: row[4] || '' }));
      }
      report.acceptedCandidates = records.length; return { records, report };
    }

    const pages = [source.url, ...(source.announcementPages || [])];
    const visited = new Set();
    for (const page of pages) {
      if (visited.has(page)) continue;
      visited.add(page);
      const html = await fetchHtml(page);
      const candidates = extractPhoneCandidatesWithContext(html);
      report.rawMatches += candidates.length;
      for (const c of candidates) {
        if (c.skipReason) { report.skippedCandidates++; report.skippedReasonsSummary[c.skipReason] = (report.skippedReasonsSummary[c.skipReason] || 0) + 1; continue; }
        records.push(buildRecord({ number: c.normalized, source, collectedAt, confidence: source.confidence, sourceUrl: page, note: `riskContextScore=${c.riskContextScore}` }));
      }
      if (source.mode === 'announcement_scrape') {
        for (const next of extractLinks(html, page)) {
          if (visited.has(next)) continue;
          visited.add(next);
          const child = await fetchHtml(next);
          const sub = extractPhoneCandidatesWithContext(child);
          report.rawMatches += sub.length;
          for (const c of sub) {
            if (c.skipReason) { report.skippedCandidates++; report.skippedReasonsSummary[c.skipReason] = (report.skippedReasonsSummary[c.skipReason] || 0) + 1; continue; }
            records.push(buildRecord({ number: c.normalized, source, collectedAt, confidence: source.confidence, sourceUrl: next, note: `riskContextScore=${c.riskContextScore};depth=1` }));
          }
        }
      }
    }
    report.acceptedCandidates = records.length;
  } catch (error) { report.status = 'error'; report.error = error.message; }
  return { records, report };
}

function safeReadJsonArray(file) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return []; } }
function calculateConfidence(item) { return Math.min(0.95, Number(item.confidence || SOURCE_CONFIDENCE_MAP[item.sourceType] || 0)); }
function mergeWithExistingPending(newItems) { const by = new Map(safeReadJsonArray(PENDING_PATH).filter((i) => i && i.number).map((i) => [i.number, i])); for (const n of newItems) { if (!by.has(n.number)) by.set(n.number, n); } return [...by.values()].sort((a, b) => a.number.localeCompare(b.number)); }

async function run() {
  const scamBefore = safeReadJsonArray(SCAM_PATH).length;
  const iosBefore = safeReadJsonArray(IOS_PATH).length;
  let totalRawMatches = 0; let totalAcceptedCandidates = 0; let totalSkippedCandidates = 0;
  const perSource = []; const allRecords = [];
  for (const source of SOURCES) {
    const { records, report } = await collectFromSource(source);
    totalRawMatches += report.rawMatches || 0;
    totalAcceptedCandidates += report.acceptedCandidates || 0;
    totalSkippedCandidates += report.skippedCandidates || 0;
    perSource.push(report);
    allRecords.push(...records.map((r) => ({ ...r, confidence: calculateConfidence(r) })));
  }
  const mergedPending = mergeWithExistingPending(allRecords);
  fs.writeFileSync(PENDING_PATH, `${JSON.stringify(mergedPending, null, 2)}\n`);

  const topSkippedReasons = Object.entries(perSource.reduce((acc, s) => { Object.entries(s.skippedReasonsSummary || {}).forEach(([k, v]) => { acc[k] = (acc[k] || 0) + v; }); return acc; }, {})).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([reason, count]) => ({ reason, count }));
  const reportPayload = {
    collectedAt: new Date().toISOString(),
    totalSources: SOURCES.length,
    totalRawMatches,
    totalAcceptedCandidates,
    totalSkippedCandidates,
    totalPendingNumbers: mergedPending.length,
    officialPromotedThisRun: 0,
    publicPendingThisRun: allRecords.filter((r) => ['public_report', 'news_or_public_reference', 'manual_import'].includes(r.sourceType)).length,
    preRunScamCount: scamBefore,
    preRunIosExportCount: iosBefore,
    sources: perSource,
    topSkippedReasons,
  };
  fs.writeFileSync(COLLECTION_REPORT_PATH, `${JSON.stringify(reportPayload, null, 2)}\n`);
}

if (require.main === module) run().catch((e) => { console.error('Collector failed unexpectedly:', e.message); process.exit(1); });
module.exports = { run, SOURCES, normalizeMXNumber, isValidMXNumber, extractPhoneCandidatesWithContext, collectFromSource, mergeWithExistingPending };
