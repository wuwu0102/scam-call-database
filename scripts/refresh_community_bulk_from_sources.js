#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = process.cwd();
const CSV_PATH = path.join(ROOT, 'data', 'community_bulk_import_numbers.csv');
const PENDING_PATH = path.join(ROOT, 'data', 'pending_numbers.json');
const SCAM_PATH = path.join(ROOT, 'scam_numbers.json');
const REPORT_PATH = path.join(ROOT, 'data', 'community_bulk_refresh_report.json');

const CSV_HEADER = 'number,label,sourceName,sourceUrl,region,note,confidence';
const BAN_SET = new Set(['911', '089', '088', '070', '072', '0000000000', '1111111111', '1234567890']);
const REGION_PRIORITY = [
  'Jalisco',
  'CDMX / Estado de México',
  'Nuevo León',
  'Puebla',
  'Baja California',
  'Guanajuato',
  'Querétaro',
  'Yucatán',
  'Veracruz'
];

const SOURCES = [
  {
    url: 'https://www.telefonospam.com.mx/top-spam',
    sourceName: 'TelefonoSpam MX Top Spam',
    sourceType: 'community_report',
    region: 'México',
    confidence: 0.45,
    note: 'Community top spam report'
  },
  {
    url: 'https://www.telefonospam.com.mx/top-spam/4',
    sourceName: 'TelefonoSpam MX Top Spam',
    sourceType: 'community_report',
    region: 'México',
    confidence: 0.45,
    note: 'Community top spam report paginated'
  },
  {
    url: 'https://www.telefonospam.com.mx/pendientes.php',
    sourceName: 'TelefonoSpam MX Pendientes',
    sourceType: 'community_report',
    region: 'México',
    confidence: 0.35,
    note: 'Community searched number, pending identification'
  },
  {
    url: 'https://www.telefonospam.com.mx/',
    sourceName: 'TelefonoSpam MX Home',
    sourceType: 'community_report',
    region: 'México',
    confidence: 0.4,
    note: 'Community top searched/spam number'
  }
];

function fetchText(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: 15000, headers: { 'User-Agent': 'Mozilla/5.0 ScamCallMX/1.0' } }, (res) => {
      if (res.statusCode && res.statusCode >= 400) {
        reject(new Error(`HTTP ${res.statusCode}`));
        res.resume();
        return;
      }
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve(data));
    });
    req.on('timeout', () => req.destroy(new Error('Request timeout')));
    req.on('error', reject);
  });
}

function safeReadJsonArray(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return Array.isArray(parsed) ? parsed : [];
}

function ensureCsvFile() {
  if (!fs.existsSync(CSV_PATH)) {
    fs.mkdirSync(path.dirname(CSV_PATH), { recursive: true });
    fs.writeFileSync(CSV_PATH, `${CSV_HEADER}\n`, 'utf8');
  }
}

function parseCsvLine(line) {
  const parts = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      parts.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  parts.push(current.trim());
  return parts;
}

function parseCsv(content) {
  const lines = content.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  if (parseCsvLine(lines[0]).join(',') !== CSV_HEADER) throw new Error('Invalid CSV header');
  return lines.slice(1).map((line) => {
    const cols = parseCsvLine(line);
    return {
      number: cols[0] || '', label: cols[1] || '', sourceName: cols[2] || '', sourceUrl: cols[3] || '',
      region: cols[4] || '', note: cols[5] || '', confidence: cols[6] || ''
    };
  });
}

function toCsvLine(row) {
  return [row.number, row.label, row.sourceName, row.sourceUrl, row.region, row.note, row.confidence]
    .map((value) => {
      const text = String(value ?? '');
      return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    }).join(',');
}

function normalizeToLocal10(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return null;

  let local = null;
  if (digits.length === 10) local = digits;
  else if (digits.length === 12 && digits.startsWith('52')) local = digits.slice(2);
  else return null;

  if (!/^\d{10}$/.test(local)) return null;
  if (BAN_SET.has(local)) return null;
  if (/^(\d)\1{9}$/.test(local)) return null;
  if (local.startsWith('800')) return null;
  if (/^52?800/.test(digits)) return null;
  return local;
}

function extractRawCandidates(text) {
  const matches = text.match(/\+?\d[\d\s()\-]{7,20}\d|\b\d{10,12}\b/g) || [];
  return matches;
}

function inferRegion(local10) {
  const p2 = local10.slice(0, 2);
  const p3 = local10.slice(0, 3);
  const map = [
    [['33'], 'Jalisco'], [['55', '56'], 'CDMX / Estado de México'], [['81'], 'Nuevo León'],
    [['222', '221', '231'], 'Puebla'], [['664'], 'Baja California'], [['477'], 'Guanajuato'],
    [['442'], 'Querétaro'], [['999'], 'Yucatán'], [['228', '229'], 'Veracruz'], [['667', '668'], 'Sinaloa'],
    [['844', '871'], 'Coahuila'], [['444', '488', '483'], 'San Luis Potosí'], [['981'], 'Campeche'],
    [['993'], 'Tabasco'], [['961', '963', '967'], 'Chiapas'], [['722', '728'], 'Estado de México'],
    [['777'], 'Morelos'], [['744'], 'Guerrero'], [['662'], 'Sonora'], [['867'], 'Tamaulipas'],
    [['312'], 'Colima'], [['618'], 'Durango'], [['771'], 'Hidalgo'], [['443'], 'Michoacán']
  ];
  for (const [prefixes, region] of map) {
    if (prefixes.some((p) => (p.length === 2 ? p2 === p : p3 === p))) return region;
  }
  return 'México';
}

(async function run() {
  ensureCsvFile();
  const now = new Date().toISOString();
  const pending = safeReadJsonArray(PENDING_PATH);
  const scam = safeReadJsonArray(SCAM_PATH);
  const csvRows = parseCsv(fs.readFileSync(CSV_PATH, 'utf8'));

  const officialSet = new Set(scam.map((x) => String(x.number || '')).filter(Boolean));
  const pendingSet = new Set(pending.map((x) => String(x.number || '')).filter(Boolean));

  let removedInvalidRows = 0;
  const existingCsvLocal = new Set();
  const cleanCsv = [];
  for (const row of csvRows) {
    const local = normalizeToLocal10(row.number);
    if (!local) { removedInvalidRows += 1; continue; }
    if (existingCsvLocal.has(local)) continue;
    existingCsvLocal.add(local);
    cleanCsv.push({ ...row, number: local, label: row.label || 'suspicious' });
  }

  const report = {
    refreshedAt: now, sourcesTried: SOURCES.length, sourcesSucceeded: 0, sourcesFailed: 0,
    rawCandidates: 0, validCandidates: 0, existingInOfficial: 0, existingInPending: 0,
    existingInCsv: 0, addedToCsv: 0, removedInvalidRows, csvBefore: csvRows.length, csvAfter: 0,
    skippedReasonsSummary: {}, sources: []
  };

  const skipped = {};
  const inc = (k) => { skipped[k] = (skipped[k] || 0) + 1; };

  for (const src of SOURCES) {
    const srcReport = { name: src.sourceName, url: src.url, fetchOk: false, rawCandidates: 0, validCandidates: 0, addedToCsv: 0, error: null };
    try {
      const text = await fetchText(src.url);
      srcReport.fetchOk = true;
      report.sourcesSucceeded += 1;
      const raws = extractRawCandidates(text);
      srcReport.rawCandidates = raws.length;
      report.rawCandidates += raws.length;

      for (const candidate of raws) {
        const local = normalizeToLocal10(candidate);
        if (!local) { inc('invalid_or_filtered'); continue; }
        srcReport.validCandidates += 1;
        report.validCandidates += 1;
        const normalized = `+52${local}`;
        if (officialSet.has(normalized)) { report.existingInOfficial += 1; inc('already_in_official'); continue; }
        if (existingCsvLocal.has(local)) { report.existingInCsv += 1; inc('already_in_csv'); continue; }
        if (pendingSet.has(normalized)) { report.existingInPending += 1; inc('already_in_pending'); continue; }

        existingCsvLocal.add(local);
        cleanCsv.push({
          number: local,
          label: 'suspicious',
          sourceName: src.sourceName,
          sourceUrl: src.url,
          region: inferRegion(local),
          note: src.note,
          confidence: String(src.confidence)
        });
        report.addedToCsv += 1;
        srcReport.addedToCsv += 1;
      }
    } catch (error) {
      report.sourcesFailed += 1;
      srcReport.error = error.message;
    }
    report.sources.push(srcReport);
  }

  report.skippedReasonsSummary = skipped;

  const priority = new Map(REGION_PRIORITY.map((v, i) => [v, i]));
  cleanCsv.sort((a, b) => {
    const pa = priority.has(a.region) ? priority.get(a.region) : 999;
    const pb = priority.has(b.region) ? priority.get(b.region) : 999;
    if (pa !== pb) return pa - pb;
    return String(a.number).localeCompare(String(b.number));
  });

  const out = `${CSV_HEADER}\n${cleanCsv.map(toCsvLine).join('\n')}\n`;
  fs.writeFileSync(CSV_PATH, out, 'utf8');
  report.csvAfter = cleanCsv.length;
  fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`Community refresh complete. Added ${report.addedToCsv}`);
})();
