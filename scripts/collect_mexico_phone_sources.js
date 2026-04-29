const fs = require('fs');
const path = require('path');
let axios = null;
try { axios = require('axios'); } catch { axios = null; }

const DATA_DIR = path.join(__dirname, '..', 'data');
const COLLECTED_OUTPUT_PATH = path.join(DATA_DIR, 'collected_mexico_numbers.json');
const CROWD_OUTPUT_PATH = path.join(DATA_DIR, 'crowd_signal_mexico_numbers.json');
const RUN_LOG_OUTPUT_PATH = path.join(DATA_DIR, 'collector_run_log.json');

const SOURCES = [
  { name: 'SAT México', url: 'https://www.gob.mx/sat/acciones-y-programas/numeros-telefonicos-falsos', type: 'official', confidence: 'high', autoImport: true, tag: 'scam', label: 'Posible fraude' },
  { name: 'Seguridad BC actual', url: 'https://seguridadbc.gob.mx/ExtorsionTelefonica/index.php', type: 'official', confidence: 'medium', autoImport: true, tag: 'scam', label: 'Posible fraude' },
  { name: 'Seguridad BC histórico 2022', url: 'https://www.seguridadbc.gob.mx/ExtorsionTelefonica/engano2022.php', type: 'official', confidence: 'medium', autoImport: true, tag: 'scam', label: 'Posible fraude' },
  { name: 'SSP Zacatecas extorsión', url: 'https://ssp.zacatecas.gob.mx/gobierno-de-zacatecas-alerta-sobre-numeros-telefonicos-usados-para-la-comision-del-delito-de-extorsion/', type: 'official', confidence: 'medium', autoImport: true, tag: 'scam', label: 'Posible fraude' },
  { name: 'SSP Zacatecas alerta', url: 'https://ssp.zacatecas.gob.mx/alerta-ssp-sobre-numeros-telefonicos-utilizados-para-extorsionar/', type: 'official', confidence: 'medium', autoImport: true, tag: 'scam', label: 'Posible fraude' },
  { name: 'Informador lista pública', url: 'https://www.informador.mx/mexico/Lista-completa-de-los-31-numeros-telefonicos-usados-para-extorsionar-en-Mexico-20240507-0216.html', type: 'media', confidence: 'medium', autoImport: true, tag: 'suspicious', label: 'Número sospechoso' },
  { name: 'Noroeste lista pública', url: 'https://www.noroeste.com.mx/nacional/conozca-los-10-numeros-telefonicos-mas-usados-para-extorsionar-LMNO940812', type: 'media', confidence: 'medium', autoImport: true, tag: 'suspicious', label: 'Número sospechoso' },
  { name: 'Tellows México', url: 'https://www.tellows.mx/', type: 'web', confidence: 'low', autoImport: false, tag: 'crowd_signal', label: 'Señal comunitaria' },
  { name: 'QuienHabla México', url: 'https://www.quienhabla.mx/', type: 'web', confidence: 'low', autoImport: false, tag: 'crowd_signal', label: 'Señal comunitaria' },
];

const toDateString = (d = new Date()) => d.toISOString().slice(0, 10);
function normalizeMXNumber(input) {
  if (!input) return '';
  let num = String(input).replace(/\D/g, '');
  if (num.startsWith('521') && num.length >= 13) num = num.slice(3);
  else if (num.startsWith('52') && num.length >= 12) num = num.slice(2);
  if (num.length > 10) num = num.slice(-10);
  return num;
}
const isValidMXNumber = (n) => /^\d{10}$/.test(n);
const isDateLike = (n) => /^(19|20)\d{2}(0[1-9]|1[0-2])([0-2]\d|3[0-1])$/.test(n) || /^([0-2]\d|3[0-1])(0[1-9]|1[0-2])(19|20)\d{2}$/.test(n);
const isInvalidPattern = (n) => /^(\d)\1{9}$/.test(n) || isDateLike(n);
function extractCandidates(text) {
  const regex = /(?:\+?52[\s\-]?)?(?:\(?\d{3}\)?[\s\-]?\d{3}[\s\-]?\d{4}|\d{10})/g;
  return String(text || '').match(regex) || [];
}
async function fetchPublicPage(url) {
  if (axios) {
    const r = await axios.get(url, { timeout: 20000, responseType: 'text', headers: { 'User-Agent': 'Mozilla/5.0 (scam-call-database-collector/3.0)' } });
    return String(r.data || '');
  }
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return await r.text();
}

function buildRecord(normalizedNumber, source, collectedAtIso, updatedAt) {
  const tag = source.type === 'media' ? 'suspicious' : source.tag;
  return {
    number: normalizedNumber, normalizedNumber, country: 'MX', tag, label: source.type === 'media' ? 'Número sospechoso' : source.label,
    type: source.type, confidence: source.confidence, source: source.name, sourceUrl: source.url,
    sources: [{ source: source.name, sourceUrl: source.url, type: source.type, confidence: source.confidence, collectedAt: collectedAtIso }],
    note: 'Número detectado en fuente pública.', updatedAt, collectedAt: collectedAtIso,
    reviewStatus: source.autoImport ? 'auto_imported' : 'signal_only'
  };
}

async function main() {
  const now = new Date();
  const collectedAtIso = now.toISOString();
  const updatedAt = toDateString(now);
  const autoByNumber = new Map();
  const crowdByNumber = new Map();
  const runLog = { generatedAt: collectedAtIso, totalAutoImport: 0, totalCrowdSignals: 0, sources: [] };

  for (const source of SOURCES) {
    const log = { source: source.name, url: source.url, accepted: 0, duplicates: 0, invalid: 0, errors: [] };
    try {
      const html = await fetchPublicPage(source.url);
      const candidates = extractCandidates(html);
      for (const raw of candidates) {
        const normalized = normalizeMXNumber(raw);
        if (!isValidMXNumber(normalized) || isInvalidPattern(normalized)) { log.invalid += 1; continue; }
        const target = source.autoImport ? autoByNumber : crowdByNumber;
        if (target.has(normalized)) { log.duplicates += 1; continue; }
        target.set(normalized, buildRecord(normalized, source, collectedAtIso, updatedAt));
        log.accepted += 1;
      }
    } catch (error) {
      log.errors.push(String(error.message || error));
    }
    runLog.sources.push(log);
  }

  const autoImportRecords = Array.from(autoByNumber.values()).sort((a,b)=>a.normalizedNumber.localeCompare(b.normalizedNumber));
  const crowdSignals = Array.from(crowdByNumber.values()).sort((a,b)=>a.normalizedNumber.localeCompare(b.normalizedNumber));
  runLog.totalAutoImport = autoImportRecords.length;
  runLog.totalCrowdSignals = crowdSignals.length;

  fs.writeFileSync(COLLECTED_OUTPUT_PATH, `${JSON.stringify(autoImportRecords, null, 2)}\n`, 'utf8');
  fs.writeFileSync(CROWD_OUTPUT_PATH, `${JSON.stringify(crowdSignals, null, 2)}\n`, 'utf8');
  fs.writeFileSync(RUN_LOG_OUTPUT_PATH, `${JSON.stringify(runLog, null, 2)}\n`, 'utf8');

  console.log(`Collected auto-import records: ${autoImportRecords.length}`);
  console.log(`Collected crowd signals: ${crowdSignals.length}`);
}

main().catch((e)=>{ console.error(e); process.exit(1); });
