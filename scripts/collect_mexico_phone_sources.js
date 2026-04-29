const fs = require('fs');
const path = require('path');
let axios = null;
try { axios = require('axios'); } catch { axios = null; }

const DATA_DIR = path.join(__dirname, '..', 'data');
const COLLECTED_OUTPUT_PATH = path.join(DATA_DIR, 'collected_mexico_numbers.json');
const CROWD_OUTPUT_PATH = path.join(DATA_DIR, 'crowd_signal_mexico_numbers.json');
const RUN_LOG_OUTPUT_PATH = path.join(DATA_DIR, 'collector_run_log.json');
const SEED_PATH = path.join(DATA_DIR, 'mexico_seed_phone_numbers.json');
const SCAM_NUMBERS_PATH = path.join(__dirname, '..', 'scam_numbers.json');

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
const readJsonArray = (filePath, key = null) => {
  if (!fs.existsSync(filePath)) return [];
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (Array.isArray(parsed)) return parsed;
  if (key && Array.isArray(parsed[key])) return parsed[key];
  return [];
};

function priority(record) {
  const type = String(record.type || '').toLowerCase();
  const confidence = String(record.confidence || '').toLowerCase();
  if (type === 'official' && confidence === 'high') return 5;
  if (type === 'official' && confidence === 'medium') return 4;
  if (type === 'media' && confidence === 'medium') return 3;
  if (type === 'web' && confidence === 'low') return 2;
  if (type === 'user_report') return 1;
  return 0;
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

function sanitizeSeedLikeRecord(record) {
  const normalized = normalizeMXNumber(record.normalizedNumber || record.number || record.phone || '');
  if (!isValidMXNumber(normalized) || isInvalidPattern(normalized)) return null;
  const country = String(record.country || '').toUpperCase();
  if (country && country !== 'MX') return null;
  return {
    ...record,
    number: normalized,
    normalizedNumber: normalized,
    country: 'MX',
    tag: record.tag || 'suspicious',
    label: record.label || 'Número sospechoso',
    type: record.type || record.sourceType || 'official',
    confidence: record.confidence || 'medium',
    source: record.source || record.sourceName || 'Imported seed',
    sourceUrl: record.sourceUrl || 'local://seed',
    reviewStatus: record.reviewStatus || 'auto_imported',
    updatedAt: record.updatedAt || toDateString(new Date()),
  };
}

function mergeRecords(...collections) {
  const merged = new Map();
  for (const records of collections) {
    for (const raw of records) {
      const record = sanitizeSeedLikeRecord(raw);
      if (!record) continue;
      const existing = merged.get(record.normalizedNumber);
      if (!existing) {
        merged.set(record.normalizedNumber, record);
        continue;
      }
      const keep = priority(existing) >= priority(record) ? existing : record;
      const sourceMap = new Map();
      [...(existing.sources || []), ...(record.sources || [])].forEach((src) => {
        const key = `${src.sourceUrl || ''}::${src.source || ''}`;
        sourceMap.set(key, src);
      });
      merged.set(record.normalizedNumber, { ...keep, sources: Array.from(sourceMap.values()) });
    }
  }
  return Array.from(merged.values()).sort((a, b) => a.normalizedNumber.localeCompare(b.normalizedNumber));
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

  const harvestedAutoRecords = Array.from(autoByNumber.values());
  const harvestedCrowdRecords = Array.from(crowdByNumber.values()).sort((a, b) => a.normalizedNumber.localeCompare(b.normalizedNumber));

  const existingCollected = readJsonArray(COLLECTED_OUTPUT_PATH);
  const seedRecords = readJsonArray(SEED_PATH);
  const scamFallback = readJsonArray(SCAM_NUMBERS_PATH, 'records').filter((record) => {
    const normalized = normalizeMXNumber(record.normalizedNumber || record.number || record.phone || '');
    return isValidMXNumber(normalized) && (String(record.country || '').toUpperCase() === 'MX' || normalized.length === 10);
  });

  const autoImportRecords = mergeRecords(seedRecords, existingCollected, scamFallback, harvestedAutoRecords);
  const crowdSignals = mergeRecords(readJsonArray(CROWD_OUTPUT_PATH), harvestedCrowdRecords);

  runLog.totalAutoImport = autoImportRecords.length;
  runLog.totalCrowdSignals = crowdSignals.length;

  const sourceFetchFailures = runLog.sources.every((entry) => Array.isArray(entry.errors) && entry.errors.length > 0);
  const noRecordsCollected = harvestedAutoRecords.length === 0 && harvestedCrowdRecords.length === 0;
  if (sourceFetchFailures || noRecordsCollected) {
    runLog.skippedWrite = true;
    runLog.reason = 'All sources failed or no records collected; preserved previous data files.';
    fs.writeFileSync(RUN_LOG_OUTPUT_PATH, `${JSON.stringify(runLog, null, 2)}\n`, 'utf8');
    console.log(runLog.reason);
    console.log(`Collected auto-import records: ${autoImportRecords.length} (preserved)`);
    console.log(`Collected crowd signals: ${crowdSignals.length} (preserved)`);
    return;
  }

  fs.writeFileSync(COLLECTED_OUTPUT_PATH, `${JSON.stringify(autoImportRecords, null, 2)}\n`, 'utf8');
  fs.writeFileSync(CROWD_OUTPUT_PATH, `${JSON.stringify(crowdSignals, null, 2)}\n`, 'utf8');
  fs.writeFileSync(RUN_LOG_OUTPUT_PATH, `${JSON.stringify(runLog, null, 2)}\n`, 'utf8');

  console.log(`Collected auto-import records: ${autoImportRecords.length}`);
  console.log(`Collected crowd signals: ${crowdSignals.length}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
