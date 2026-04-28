const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const PENDING_PATH = path.join(DATA_DIR, 'pending_numbers.json');
const MANUAL_CSV_PATH = path.join(DATA_DIR, 'manual_import_numbers.csv');

const SOURCE_CONFIDENCE_MAP = {
  official_federal: 0.9,
  official_state: 0.85,
  official_state_lookup: 0.8,
  official_state_announcement: 0.75,
  official_state_app_reference: 0.75,
  municipal_public_report: 0.65,
  financial_fraud: 0.85,
  manual_import: 0.5,
  news_or_social_reference: 0.45,
  public_report: 0.4,
};

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
  { name: 'Manual Import CSV', file: 'data/manual_import_numbers.csv', type: 'manual_import', mode: 'csv_import', confidence: 0.5 },
];

async function fetchHtml(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        'User-Agent': 'scam-call-database-mx-collector/1.0',
        Accept: 'text/html,application/xhtml+xml',
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

function extractPhoneNumbersFromText(text) {
  if (!text) return [];
  const matches = text.match(/(?:\+?\s*52\s*[-\s]?)?(?:1\s*[-\s]?)?(?:\(?\d{2,3}\)?\s*[-\s]?)?\d{3,4}\s*[-\s]?\d{4}|\b\d{10,13}\b/g) || [];
  return Array.from(new Set(matches));
}

function normalizeMXNumber(raw) {
  if (!raw) return '';
  let digits = String(raw).replace(/\D/g, '');
  if (/^(911|089|088)$/.test(digits)) return '';

  if (digits.startsWith('521') && digits.length >= 13) {
    digits = digits.slice(3);
  } else if (digits.startsWith('52') && digits.length >= 12) {
    digits = digits.slice(2);
  }

  if (digits.length > 10) digits = digits.slice(-10);
  if (digits.length !== 10) return '';

  return `+52${digits}`;
}

function isValidMXNumber(number) {
  if (!/^\+52\d{10}$/.test(number)) return false;
  const local = number.slice(3);
  if (['0000000000', '1111111111', '1234567890'].includes(local)) return false;
  if (/^(\d)\1{9}$/.test(local)) return false;
  if (local.startsWith('000') || local.endsWith('0000')) return false;
  return true;
}

function parseCsvLine(line) {
  const out = [];
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
      out.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  out.push(current);
  return out;
}

function loadManualImportCsv() {
  if (!fs.existsSync(MANUAL_CSV_PATH)) {
    fs.writeFileSync(MANUAL_CSV_PATH, 'number,label,source,note\n', 'utf8');
  }

  const content = fs.readFileSync(MANUAL_CSV_PATH, 'utf8');
  const lines = content.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length <= 1) return [];

  const items = [];
  for (let i = 1; i < lines.length; i += 1) {
    const [number, label = 'suspicious', source = '', note = ''] = parseCsvLine(lines[i]);
    items.push({ number, label: label || 'suspicious', source, note });
  }

  return items;
}

async function collectFromSource(source) {
  const collectedAt = new Date().toISOString();
  const records = [];

  if (source.mode === 'csv_import') {
    const rows = loadManualImportCsv();
    for (const row of rows) {
      const normalized = normalizeMXNumber(row.number);
      if (!isValidMXNumber(normalized)) continue;
      records.push({
        number: normalized,
        label: 'suspicious',
        country: 'MX',
        sourceType: 'manual_import',
        sourceName: 'Manual Import',
        sourceUrl: 'manual://data/manual_import_numbers.csv',
        confidence: 0.5,
        status: 'pending_review',
        evidenceCount: 1,
        sources: [{
          sourceName: 'Manual Import',
          sourceType: 'manual_import',
          sourceUrl: 'manual://data/manual_import_numbers.csv',
          confidence: 0.5,
          mode: 'csv_import',
          collectedAt,
        }],
        firstSeenAt: collectedAt,
        updatedAt: collectedAt,
        note: row.note || '',
      });
    }
    return records;
  }

  const html = await fetchHtml(source.url);
  const candidates = extractPhoneNumbersFromText(html);

  for (const candidate of candidates) {
    const normalized = normalizeMXNumber(candidate);
    if (!isValidMXNumber(normalized)) continue;

    records.push({
      number: normalized,
      label: 'suspicious',
      country: 'MX',
      sourceType: source.type,
      sourceName: source.name,
      sourceUrl: source.url,
      confidence: source.confidence,
      status: source.confidence >= 0.85 ? 'pending_review_high_confidence' : 'pending_review',
      evidenceCount: 1,
      sources: [{
        sourceName: source.name,
        sourceType: source.type,
        sourceUrl: source.url,
        confidence: source.confidence,
        mode: source.mode,
        collectedAt,
      }],
      firstSeenAt: collectedAt,
      updatedAt: collectedAt,
      note: '',
    });
  }

  return records;
}

function calculateConfidence(item) {
  const sourceConfs = (item.sources || []).map((s) => Number(s.confidence || SOURCE_CONFIDENCE_MAP[s.sourceType] || 0));
  const maxBase = sourceConfs.length ? Math.max(...sourceConfs) : Number(item.confidence || 0);
  const evidenceCount = item.evidenceCount || sourceConfs.length || 1;

  let boost = 0;
  if (evidenceCount >= 3) boost = 0.1;
  else if (evidenceCount >= 2) boost = 0.05;

  const confidence = Math.min(0.95, Number((maxBase + boost).toFixed(2)));
  return confidence;
}

function mergeWithExistingPending(newItems) {
  const nowIso = new Date().toISOString();
  let existing = [];

  if (fs.existsSync(PENDING_PATH)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(PENDING_PATH, 'utf8'));
      if (Array.isArray(parsed)) existing = parsed;
    } catch (error) {
      console.warn(`Failed to parse existing pending file: ${error.message}`);
    }
  }

  const byNumber = new Map();
  for (const item of existing) {
    if (item && item.number) byNumber.set(item.number, item);
  }

  for (const incoming of newItems) {
    const existingItem = byNumber.get(incoming.number);
    if (!existingItem) {
      const merged = { ...incoming };
      merged.evidenceCount = (merged.sources || []).length || 1;
      merged.confidence = calculateConfidence(merged);
      merged.status = merged.confidence >= 0.85 ? 'pending_review_high_confidence' : 'pending_review';
      byNumber.set(incoming.number, merged);
      continue;
    }

    const sourceMap = new Map();
    for (const source of [...(existingItem.sources || []), ...(incoming.sources || [])]) {
      const key = `${source.sourceUrl}::${source.sourceName}::${source.mode}`;
      sourceMap.set(key, source);
    }

    const mergedSources = Array.from(sourceMap.values());
    const mergedItem = {
      ...existingItem,
      label: 'suspicious',
      country: 'MX',
      sourceType: existingItem.sourceType || incoming.sourceType,
      sourceName: existingItem.sourceName || incoming.sourceName,
      sourceUrl: existingItem.sourceUrl || incoming.sourceUrl,
      sources: mergedSources,
      evidenceCount: mergedSources.length,
      note: existingItem.note || incoming.note || '',
      firstSeenAt: existingItem.firstSeenAt || incoming.firstSeenAt || nowIso,
      updatedAt: nowIso,
    };

    mergedItem.confidence = calculateConfidence(mergedItem);
    mergedItem.status = mergedItem.confidence >= 0.85 ? 'pending_review_high_confidence' : 'pending_review';
    byNumber.set(incoming.number, mergedItem);
  }

  return Array.from(byNumber.values()).sort((a, b) => a.number.localeCompare(b.number));
}

async function run() {
  const allNewItems = [];
  const sourceResults = [];

  for (const source of SOURCES) {
    try {
      const collected = await collectFromSource(source);
      allNewItems.push(...collected);
      sourceResults.push({ source: source.name, mode: source.mode, success: true, count: collected.length });
    } catch (error) {
      console.warn(`Source failed: ${source.name} (${source.mode}) - ${error.message}`);
      sourceResults.push({ source: source.name, mode: source.mode, success: false, count: 0, error: error.message });
    }
  }

  if (allNewItems.length === 0) {
    console.log('No new numbers collected');
    if (!fs.existsSync(PENDING_PATH)) {
      fs.writeFileSync(PENDING_PATH, '[]\n', 'utf8');
    }
  } else {
    const merged = mergeWithExistingPending(allNewItems);
    fs.writeFileSync(PENDING_PATH, `${JSON.stringify(merged, null, 2)}\n`, 'utf8');
    console.log(`Collected ${allNewItems.length} raw items, pending total ${merged.length}`);
  }

  const successSources = sourceResults.filter((r) => r.success).map((r) => r.source);
  const failedSources = sourceResults.filter((r) => !r.success).map((r) => r.source);
  console.log(`Sources success: ${successSources.length}`);
  console.log(`Sources failed: ${failedSources.length}`);
  if (failedSources.length) console.log(`Failed list: ${failedSources.join(' | ')}`);
}

if (require.main === module) {
  run().catch((error) => {
    console.error('Collector failed unexpectedly:', error.message);
    process.exit(1);
  });
}

module.exports = {
  SOURCES,
  fetchHtml,
  extractPhoneNumbersFromText,
  normalizeMXNumber,
  isValidMXNumber,
  loadManualImportCsv,
  collectFromSource,
  mergeWithExistingPending,
  calculateConfidence,
  run,
};
