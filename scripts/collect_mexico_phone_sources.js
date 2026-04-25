const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const COLLECTED_OUTPUT_PATH = path.join(DATA_DIR, 'collected_mexico_numbers.json');
const REVIEW_QUEUE_OUTPUT_PATH = path.join(DATA_DIR, 'review_queue_mexico_numbers.json');
const RUN_LOG_OUTPUT_PATH = path.join(DATA_DIR, 'collector_run_log.json');

const SOURCES = [
  {
    source: 'SAT México',
    sourceUrl: 'https://www.gob.mx/sat/acciones-y-programas/numeros-telefonicos-falsos',
    type: 'official',
    confidence: 'high',
    reviewStatus: 'auto_approved',
  },
  {
    source: 'Seguridad BC',
    sourceUrl: 'https://seguridadbc.gob.mx/ExtorsionTelefonica/index.php',
    type: 'official',
    confidence: 'medium',
    reviewStatus: 'auto_approved',
  },
  {
    source: 'Seguridad BC',
    sourceUrl: 'https://www.seguridadbc.gob.mx/ExtorsionTelefonica/engano.php',
    type: 'official',
    confidence: 'medium',
    reviewStatus: 'auto_approved',
  },
  {
    source: 'Seguridad BC (histórico 2022)',
    sourceUrl: 'https://www.seguridadbc.gob.mx/ExtorsionTelefonica/engano2022.php',
    type: 'official',
    confidence: 'medium',
    reviewStatus: 'auto_approved',
  },
];

function toDateString(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function scoreRank(record) {
  if (record.type === 'official' && record.confidence === 'high') return 4;
  if (record.type === 'official' && record.confidence === 'medium') return 3;
  if (record.type === 'community') return 2;
  if (record.type === 'user_report') return 1;
  return 0;
}

function loadKnownUserReportNumbers() {
  const known = new Set();
  const potentialFiles = [
    path.join(DATA_DIR, 'user_report_numbers.json'),
    path.join(__dirname, '..', 'scam_numbers.json'),
  ];

  for (const filePath of potentialFiles) {
    if (!fs.existsSync(filePath)) continue;

    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const records = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed.records)
          ? parsed.records
          : [];

      for (const record of records) {
        const sourceType = String(record.type || record.sourceType || '').toLowerCase();
        if (sourceType !== 'user_report') continue;

        const number = String(record.normalizedNumber || record.number || record.phone || '').replace(/\D/g, '');
        if (number.length >= 10 && number.length <= 12) {
          known.add(number.length === 12 && number.startsWith('52') ? number.slice(2) : number);
        }
      }
    } catch (error) {
      // Ignore malformed optional files. Collector still runs for official public sources.
    }
  }

  return known;
}

function normalizeMexicanNumber(rawDigits) {
  if (!rawDigits) return null;

  if (rawDigits.length === 12 && rawDigits.startsWith('52')) {
    return rawDigits.slice(2);
  }

  if (rawDigits.length === 10) {
    return rawDigits;
  }

  return null;
}

function isObviousInvalidNumber(normalizedNumber, knownUserReportNumbers) {
  if (!normalizedNumber) return true;

  if (knownUserReportNumbers.has(normalizedNumber)) return false;

  if (/^(\d)\1{9}$/.test(normalizedNumber)) return true;
  if (normalizedNumber === '1234567890' || normalizedNumber === '0987654321') return true;

  return false;
}

function extractCandidates(text) {
  // Broad token extraction first, then strict digit-length validation below.
  const matches = text.match(/\+?\d[\d\s\-()]{8,16}\d/g) || [];
  return matches.map((value) => value.trim());
}

async function fetchPublicPage(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  try {
    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        'User-Agent': 'scam-call-database-collector/1.0 (+public source collector)',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

function upsertRecord(byNumber, record) {
  const existing = byNumber.get(record.normalizedNumber);
  const sourceRef = {
    source: record.source,
    sourceUrl: record.sourceUrl,
    collectedAt: record.collectedAt,
  };

  if (!existing) {
    byNumber.set(record.normalizedNumber, {
      ...record,
      sources: [sourceRef],
    });
    return;
  }

  existing.sources = existing.sources || [];
  if (!existing.sources.some((item) => item.sourceUrl === sourceRef.sourceUrl)) {
    existing.sources.push(sourceRef);
  }

  if (scoreRank(record) > scoreRank(existing)) {
    byNumber.set(record.normalizedNumber, {
      ...record,
      sources: existing.sources,
    });
  } else {
    byNumber.set(record.normalizedNumber, {
      ...existing,
      sources: existing.sources,
    });
  }
}

function buildRecord(normalizedNumber, sourceConfig, collectedAt) {
  return {
    number: normalizedNumber,
    normalizedNumber,
    country: 'MX',
    tag: 'scam',
    label: 'Posible fraude',
    type: sourceConfig.type,
    confidence: sourceConfig.confidence,
    source: sourceConfig.source,
    sourceUrl: sourceConfig.sourceUrl,
    note:
      sourceConfig.type === 'official'
        ? 'Número detectado en fuente pública oficial.'
        : 'Número detectado en fuente comunitaria pública. Requiere revisión manual.',
    collectedAt,
    reviewStatus: sourceConfig.reviewStatus,
  };
}

function sortByNumberAsc(a, b) {
  return a.normalizedNumber.localeCompare(b.normalizedNumber);
}

async function main() {
  const startedAt = new Date().toISOString();
  const collectedAt = toDateString();
  const knownUserReportNumbers = loadKnownUserReportNumbers();
  const recordsByNumber = new Map();
  const runLog = {
    startedAt,
    completedAt: null,
    collectedAt,
    sources: [],
    totals: {
      extractedCandidates: 0,
      acceptedRecords: 0,
      reviewQueue: 0,
      autoApproved: 0,
      rejected: 0,
      deduplicated: 0,
    },
    rejectedSamples: [],
  };

  for (const sourceConfig of SOURCES) {
    const sourceEntry = {
      source: sourceConfig.source,
      sourceUrl: sourceConfig.sourceUrl,
      status: 'ok',
      extractedCandidates: 0,
      accepted: 0,
      rejected: 0,
      error: null,
    };

    try {
      const html = await fetchPublicPage(sourceConfig.sourceUrl);
      const candidates = extractCandidates(html);
      sourceEntry.extractedCandidates = candidates.length;
      runLog.totals.extractedCandidates += candidates.length;

      for (const candidate of candidates) {
        const digits = candidate.replace(/\D/g, '');

        if (digits.length < 10 || digits.length > 12) {
          sourceEntry.rejected += 1;
          runLog.totals.rejected += 1;
          continue;
        }

        const normalizedNumber = normalizeMexicanNumber(digits);
        if (!normalizedNumber || normalizedNumber.length !== 10) {
          sourceEntry.rejected += 1;
          runLog.totals.rejected += 1;
          continue;
        }

        if (isObviousInvalidNumber(normalizedNumber, knownUserReportNumbers)) {
          sourceEntry.rejected += 1;
          runLog.totals.rejected += 1;
          if (runLog.rejectedSamples.length < 20) {
            runLog.rejectedSamples.push({ sourceUrl: sourceConfig.sourceUrl, candidate, reason: 'obvious_invalid' });
          }
          continue;
        }

        const record = buildRecord(normalizedNumber, sourceConfig, collectedAt);
        upsertRecord(recordsByNumber, record);
        sourceEntry.accepted += 1;
      }
    } catch (error) {
      sourceEntry.status = 'error';
      sourceEntry.error = String(error.message || error);
    }

    runLog.sources.push(sourceEntry);
  }

  const allRecords = Array.from(recordsByNumber.values()).sort(sortByNumberAsc);
  const collectedRecords = allRecords.filter(
    (record) => record.type === 'official' && record.reviewStatus === 'auto_approved',
  );
  const reviewQueueRecords = allRecords.filter((record) => record.reviewStatus === 'pending_review');

  runLog.totals.acceptedRecords = allRecords.length;
  runLog.totals.autoApproved = collectedRecords.length;
  runLog.totals.reviewQueue = reviewQueueRecords.length;
  runLog.totals.deduplicated = runLog.totals.extractedCandidates - runLog.totals.rejected - allRecords.length;
  runLog.completedAt = new Date().toISOString();

  // SAFETY: Only official + auto_approved records are written to collected_mexico_numbers.json
  // for downstream import. Community numbers must remain in review_queue_mexico_numbers.json.
  fs.writeFileSync(COLLECTED_OUTPUT_PATH, `${JSON.stringify(collectedRecords, null, 2)}\n`, 'utf8');
  fs.writeFileSync(REVIEW_QUEUE_OUTPUT_PATH, `${JSON.stringify(reviewQueueRecords, null, 2)}\n`, 'utf8');
  fs.writeFileSync(RUN_LOG_OUTPUT_PATH, `${JSON.stringify(runLog, null, 2)}\n`, 'utf8');

  console.log(`Collector complete. autoApproved=${collectedRecords.length} reviewQueue=${reviewQueueRecords.length}`);
  console.log(`Wrote: ${COLLECTED_OUTPUT_PATH}`);
  console.log(`Wrote: ${REVIEW_QUEUE_OUTPUT_PATH}`);
  console.log(`Wrote: ${RUN_LOG_OUTPUT_PATH}`);
}

main().catch((error) => {
  console.error('Mexico public source collector failed.');
  console.error(error);
  process.exit(1);
});
