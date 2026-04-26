const fs = require('fs');
const path = require('path');
let axios = null;
try {
  axios = require('axios');
} catch {
  axios = null;
}

const DATA_DIR = path.join(__dirname, '..', 'data');
const COLLECTED_OUTPUT_PATH = path.join(DATA_DIR, 'collected_mexico_numbers.json');
const REVIEW_QUEUE_OUTPUT_PATH = path.join(DATA_DIR, 'review_queue_mexico_numbers.json');
const RUN_LOG_OUTPUT_PATH = path.join(DATA_DIR, 'collector_run_log.json');

const SOURCES = [
  {
    name: 'SAT México',
    url: 'https://www.gob.mx/sat/acciones-y-programas/numeros-telefonicos-falsos',
    type: 'official',
    confidence: 'high',
    tag: 'scam',
    label: 'Posible fraude',
    reviewStatus: 'auto_approved',
  },
  {
    name: 'Seguridad BC - Extorsión Telefónica',
    url: 'https://seguridadbc.gob.mx/ExtorsionTelefonica/index.php',
    type: 'official',
    confidence: 'medium',
    tag: 'scam',
    label: 'Posible fraude',
    reviewStatus: 'auto_approved',
  },
  {
    name: 'Seguridad BC - Histórico 2022',
    url: 'https://www.seguridadbc.gob.mx/ExtorsionTelefonica/engano2022.php',
    type: 'official',
    confidence: 'medium',
    tag: 'scam',
    label: 'Posible fraude',
    reviewStatus: 'auto_approved',
  },
  {
    name: 'Informador - lista pública',
    url: 'https://www.informador.mx/mexico/Lista-completa-de-los-31-numeros-telefonicos-usados-para-extorsionar-en-Mexico-20240507-0216.html',
    type: 'media',
    confidence: 'medium',
    tag: 'suspicious',
    label: 'Número sospechoso',
    reviewStatus: 'pending_review',
  },
  {
    name: 'Noroeste - lista pública',
    url: 'https://www.noroeste.com.mx/nacional/conozca-los-10-numeros-telefonicos-mas-usados-para-extorsionar-LMNO940812',
    type: 'media',
    confidence: 'medium',
    tag: 'suspicious',
    label: 'Número sospechoso',
    reviewStatus: 'pending_review',
  },
  {
    name: 'Tellows México',
    url: 'https://www.tellows.mx/',
    type: 'web',
    confidence: 'low',
    tag: 'suspicious',
    label: 'Número sospechoso',
    reviewStatus: 'pending_review',
  },
  {
    name: 'QuienHabla México',
    url: 'https://www.quienhabla.mx/',
    type: 'web',
    confidence: 'low',
    tag: 'suspicious',
    label: 'Número sospechoso',
    reviewStatus: 'pending_review',
  },
];

function toDateString(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function normalizeMXNumber(input) {
  if (!input) return '';

  let num = String(input).replace(/\D/g, '');

  if (num.length === 12 && num.startsWith('52')) {
    num = num.slice(2);
  }

  if (num.length === 13 && num.startsWith('521')) {
    num = num.slice(3);
  }

  if (num.length > 10) {
    num = num.slice(-10);
  }

  return num;
}

function isValidMXNumber(num) {
  return /^\d{10}$/.test(num);
}

function sourcePriority(record) {
  if (record.type === 'official' && record.confidence === 'high') return 5;
  if (record.type === 'official' && record.confidence === 'medium') return 4;
  if (record.type === 'media' && record.confidence === 'medium') return 3;
  if (record.type === 'web' && record.confidence === 'low') return 2;
  if (record.type === 'user_report') return 1;
  return 0;
}

function loadTrustedKnownNumbers() {
  const known = new Set();
  const filePaths = [
    path.join(DATA_DIR, 'mexico_seed_phone_numbers.json'),
    path.join(DATA_DIR, 'collected_mexico_numbers.json'),
    path.join(DATA_DIR, 'user_report_numbers.json'),
    path.join(__dirname, '..', 'scam_numbers.json'),
  ];

  for (const filePath of filePaths) {
    if (!fs.existsSync(filePath)) continue;

    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const records = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed.records)
          ? parsed.records
          : [];

      for (const record of records) {
        const candidate = normalizeMXNumber(record.normalizedNumber || record.number || record.phone || '');
        if (isValidMXNumber(candidate)) {
          known.add(candidate);
        }
      }
    } catch {
      // Ignore malformed optional files.
    }
  }

  return known;
}

function isDateLikeNumber(num) {
  if (!/^\d{10}$/.test(num)) return false;
  const yyyy = Number(num.slice(0, 4));
  const mm = Number(num.slice(4, 6));
  const dd = Number(num.slice(6, 8));
  if (yyyy >= 1900 && yyyy <= 2099 && mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) return true;

  const dd2 = Number(num.slice(0, 2));
  const mm2 = Number(num.slice(2, 4));
  const yyyy2 = Number(num.slice(4, 8));
  if (yyyy2 >= 1900 && yyyy2 <= 2099 && mm2 >= 1 && mm2 <= 12 && dd2 >= 1 && dd2 <= 31) return true;

  return false;
}

function isObviousInvalid(num, knownNumbers) {
  if (!isValidMXNumber(num)) return true;
  if (knownNumbers.has(num)) return false;
  if (/^(\d)\1{9}$/.test(num)) return true;
  if (/19\d{2}|20\d{2}/.test(num)) {
    const yearMatches = num.match(/(19\d{2}|20\d{2})/g) || [];
    if (yearMatches.length >= 2) return true;
  }
  if (isDateLikeNumber(num)) return true;
  return false;
}

function extractCandidates(text) {
  const regex = /(?:\+?52[\s\-]?)?(?:\(?\d{2,3}\)?[\s\-]?\d{3,4}[\s\-]?\d{4}|\d{10})/g;
  return text.match(regex) || [];
}

async function fetchPublicPage(url) {
  if (axios) {
    const response = await axios.get(url, {
      timeout: 20000,
      responseType: 'text',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; scam-call-database-collector/2.0)',
        Accept: 'text/html,application/xhtml+xml',
      },
    });
    return String(response.data || '');
  }

  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return await response.text();
}

function buildRecord(normalizedNumber, sourceConfig, collectedAtIso, updatedAtDate) {
  return {
    number: normalizedNumber,
    normalizedNumber,
    country: 'MX',
    tag: sourceConfig.tag,
    label: sourceConfig.label,
    type: sourceConfig.type,
    confidence: sourceConfig.confidence,
    source: sourceConfig.name,
    sourceUrl: sourceConfig.url,
    sources: [
      {
        source: sourceConfig.name,
        sourceUrl: sourceConfig.url,
        type: sourceConfig.type,
        confidence: sourceConfig.confidence,
        collectedAt: collectedAtIso,
      },
    ],
    note: 'Número detectado en fuente pública.',
    updatedAt: updatedAtDate,
    collectedAt: collectedAtIso,
    reviewStatus: sourceConfig.reviewStatus,
  };
}

function upsertRecord(byNumber, incomingRecord) {
  const existing = byNumber.get(incomingRecord.normalizedNumber);
  if (!existing) {
    byNumber.set(incomingRecord.normalizedNumber, incomingRecord);
    return;
  }

  const sourceMap = new Map();
  [...(existing.sources || []), ...(incomingRecord.sources || [])].forEach((sourceRef) => {
    const key = `${sourceRef.sourceUrl}::${sourceRef.source}`;
    sourceMap.set(key, sourceRef);
  });

  const preferred = sourcePriority(incomingRecord) > sourcePriority(existing) ? incomingRecord : existing;
  byNumber.set(incomingRecord.normalizedNumber, {
    ...preferred,
    sources: Array.from(sourceMap.values()),
  });
}

async function main() {
  const now = new Date();
  const collectedAtIso = now.toISOString();
  const updatedAtDate = toDateString(now);
  const knownNumbers = loadTrustedKnownNumbers();
  const byNumber = new Map();
  const sourceCounts = {};

  for (const sourceConfig of SOURCES) {
    let acceptedFromSource = 0;

    try {
      const html = await fetchPublicPage(sourceConfig.url);
      const candidates = extractCandidates(html);

      for (const candidate of candidates) {
        const normalizedNumber = normalizeMXNumber(candidate);
        if (isObviousInvalid(normalizedNumber, knownNumbers)) {
          continue;
        }

        const record = buildRecord(normalizedNumber, sourceConfig, collectedAtIso, updatedAtDate);
        const beforeSize = byNumber.size;
        upsertRecord(byNumber, record);
        if (byNumber.size >= beforeSize) {
          acceptedFromSource += 1;
        }
      }
    } catch (error) {
      sourceCounts[sourceConfig.name] = { accepted: 0, error: String(error.message || error) };
      continue;
    }

    sourceCounts[sourceConfig.name] = { accepted: acceptedFromSource, error: null };
  }

  const allRecords = Array.from(byNumber.values()).sort((a, b) => a.normalizedNumber.localeCompare(b.normalizedNumber));
  const autoApprovedRecords = allRecords.filter((record) => record.reviewStatus === 'auto_approved');
  const pendingReviewRecords = allRecords.filter((record) => record.reviewStatus === 'pending_review');

  const runLog = {
    lastRunAt: collectedAtIso,
    sourceCounts,
    autoApprovedCount: autoApprovedRecords.length,
    pendingReviewCount: pendingReviewRecords.length,
    totalCollectedCount: allRecords.length,
  };

  fs.writeFileSync(COLLECTED_OUTPUT_PATH, `${JSON.stringify(autoApprovedRecords, null, 2)}\n`, 'utf8');
  fs.writeFileSync(REVIEW_QUEUE_OUTPUT_PATH, `${JSON.stringify(pendingReviewRecords, null, 2)}\n`, 'utf8');
  fs.writeFileSync(RUN_LOG_OUTPUT_PATH, `${JSON.stringify(runLog, null, 2)}\n`, 'utf8');

  console.log(`Collector complete. total=${allRecords.length} autoApproved=${autoApprovedRecords.length} pending=${pendingReviewRecords.length}`);
}

main().catch((error) => {
  console.error('Mexico public source collector failed.');
  console.error(error);
  process.exit(1);
});
