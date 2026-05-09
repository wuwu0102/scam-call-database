const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PENDING = path.join(ROOT, 'data', 'pending_numbers.json');
const SCAM = path.join(ROOT, 'scam_numbers.json');
const IOS = path.join(ROOT, 'data', 'ios_numbers.json');
const BACKUP = path.join(ROOT, 'data', 'backups', 'scam_numbers.backup.json');
const TMP = path.join(ROOT, 'scam_numbers.tmp.json');
const REPORT = path.join(ROOT, 'data', 'collection_report.json');

const MAX_PROMOTE = 5000;
const HARD_MAX_SCAM_COUNT = 6000;
const PREFERRED_MIN = 5000;
const PREFERRED_MAX = 5500;
const OFFICIAL_TYPES = new Set(['official_federal', 'official_state', 'official_state_announcement', 'official_state_lookup', 'financial_fraud']);
const TRUSTED_COMMUNITY_SOURCES = ['telefono spam mx top spam', 'telefono spam mx', 'números teléfono méxico', 'lada méxico spam telefónico', 'tellows mx', 'numerostelefono', 'numeros telefono'];
const BLOCKED_SOURCE_TYPES = new Set(['unknown']);
const SIGNAL_KEYWORDS = /(spam|sospechoso|reportado|molesto|cobranza|telemarketing|fraude|extorsión|extorsion|riesgo|llamadas)/i;

const SUPPLEMENTAL_FILES = [
  path.join(ROOT, 'data', 'collected_mexico_numbers.json'),
  path.join(ROOT, 'data', 'crowd_signal_mexico_numbers.json'),
  path.join(ROOT, 'data', 'static_bulk_numbers.json')
];

function safeReadArray(file) { try { const p = JSON.parse(fs.readFileSync(file, 'utf8')); return Array.isArray(p) ? p : []; } catch { return []; } }
function safeReadObject(file) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return {}; } }
function isValidMX(num) { return /^\+52\d{10}$/.test(String(num || '')); }
function isServiceNumber(num) { const n = String(num || ''); return /^\+52(911|089|088|070|072)/.test(n) || /^\+52800/.test(n) || /^\+5201800/.test(n); }
function isServiceText(v) { return /(service|hotline|customer\s*support|contacto|oficina|conmutador|denuncia\s*hotline|emergencia|客服)/i.test(String(v || '')); }
function normalizeForIos(number) { return String(number || '').replace(/^\+52/, ''); }
function includesTrustedSource(sourceName) { const lower = String(sourceName || '').toLowerCase(); return TRUSTED_COMMUNITY_SOURCES.some((s) => lower.includes(s)); }

function normalizeToPlus52(raw) {
  const d = String(raw || '').replace(/\D/g, '');
  if (d.length === 10) return `+52${d}`;
  if (d.length === 12 && d.startsWith('52')) return `+${d}`;
  return String(raw || '');
}
function loadSupplementalPending() {
  const out = [];
  for (const file of SUPPLEMENTAL_FILES) {
    const rows = safeReadArray(file);
    for (const r of rows) {
      const number = normalizeToPlus52(r.number || r.normalizedNumber);
      const sourceName = String(r.sourceName || r.source || 'Fuente pública MX').trim();
      const sourceUrl = String(r.sourceUrl || '').trim();
      const confidence = Number(r.confidence || (String(r.type || '').includes('official') ? 0.7 : 0.45));
      out.push({
        number,
        sourceName,
        sourceUrl,
        sourceType: String(r.sourceType || r.type || 'public_report').includes('official') ? 'official_state_announcement' : 'public_report',
        confidence,
        label: r.label || 'Número sospechoso',
        tag: r.tag || 'Señal comunitaria reportada',
        note: r.note || 'Reporte comunitario; indica posible spam o molestia, no confirmación legal.',
        country: 'MX',
        updatedAt: r.updatedAt || new Date().toISOString().slice(0, 10)
      });
    }
  }
  return out;
}

function run() {
  const pending = safeReadArray(PENDING).concat(loadSupplementalPending());
  const current = safeReadArray(SCAM);
  const ios = safeReadArray(IOS);
  const report = safeReadObject(REPORT);
  const previousOfficialCount = current.length;
  const previousIosCount = ios.length;
  const existingNumbers = new Set(current.map((i) => i.number));

  const aggregate = new Map();
  for (const item of pending) {
    if (!item?.number) continue;
    if (!aggregate.has(item.number)) aggregate.set(item.number, { sourceNames: new Set(), sourceUrls: new Set(), maxConfidence: 0 });
    const agg = aggregate.get(item.number);
    if (item.sourceName) agg.sourceNames.add(String(item.sourceName).trim().toLowerCase());
    if (item.sourceUrl) agg.sourceUrls.add(String(item.sourceUrl).trim().toLowerCase());
    agg.maxConfidence = Math.max(agg.maxConfidence, Number(item.confidence || 0));
  }

  let rejectedServiceNumbers = 0; let rejectedMissingSource = 0; let rejectedInvalidMX = 0;
  const candidates = [];

  for (const item of pending) {
    if (!item?.number || existingNumbers.has(item.number)) continue;
    const number = String(item.number || '').trim();
    const sourceType = String(item.sourceType || '').trim();
    const sourceName = String(item.sourceName || '').trim();
    const sourceUrl = String(item.sourceUrl || '').trim();
    const confidence = Number(item.confidence || 0);
    const agg = aggregate.get(number) || { sourceNames: new Set(), sourceUrls: new Set() };

    if (!isValidMX(number)) { rejectedInvalidMX++; continue; }
    if (isServiceNumber(number) || isServiceText(sourceName) || isServiceText(sourceUrl) || isServiceText(item.label) || isServiceText(item.tag) || isServiceText(item.note)) { rejectedServiceNumbers++; continue; }
    if (!sourceName || !sourceUrl) { rejectedMissingSource++; continue; }
    if (BLOCKED_SOURCE_TYPES.has(sourceType)) continue;

    const keywordBase = `${item.label || ''} ${item.tag || ''} ${item.note || ''} ${sourceName}`;
    const tier1 = OFFICIAL_TYPES.has(sourceType) && confidence >= 0.7;
    const tier2 = ['community_report', 'public_report'].includes(sourceType) && includesTrustedSource(sourceName) && confidence >= 0.35 && SIGNAL_KEYWORDS.test(keywordBase);
    const distinctSources = new Set([...agg.sourceNames, ...agg.sourceUrls]).size;
    const isSingleSourceManual = sourceType === 'manual_import' && distinctSources < 2;
    if (isSingleSourceManual) continue;
    const tier3 = distinctSources >= 2 && confidence >= 0.35 && !['manual_import', 'unknown'].includes(sourceType);

    let tier = null; let tag = String(item.tag || item.label || 'Señal reportada').trim(); let note = String(item.note || '').trim();
    if (tier1) { tier = 'official'; }
    else if (tier3) { tier = 'multiSource'; tag = 'Señal reportada por múltiples fuentes'; note = 'Coincidencia en múltiples fuentes públicas; riesgo potencial, no confirmación legal.'; }
    else if (tier2) { tier = 'trustedCommunity'; tag = 'Señal comunitaria reportada'; note = 'Reporte comunitario; indica posible spam o molestia, no confirmación legal.'; }
    if (!tier) continue;

    candidates.push({ item, number, sourceType, sourceName, sourceUrl, confidence, tier, tag, note, trustedSource: includesTrustedSource(sourceName) });
  }

  candidates.sort((a, b) => {
    const tierRank = { official: 0, multiSource: 1, trustedCommunity: 2 };
    if (tierRank[a.tier] !== tierRank[b.tier]) return tierRank[a.tier] - tierRank[b.tier];
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    if (a.trustedSource !== b.trustedSource) return a.trustedSource ? -1 : 1;
    return 0;
  });

  const maxByHardLimit = Math.max(0, HARD_MAX_SCAM_COUNT - current.length);
  const targetHigh = Math.min(PREFERRED_MAX, HARD_MAX_SCAM_COUNT);
  const neededForMin = Math.max(0, PREFERRED_MIN - current.length);
  const desiredAdds = Math.min(MAX_PROMOTE, maxByHardLimit, Math.max(neededForMin, Math.min(targetHigh - current.length, candidates.length)));

  const promotedRows = [];
  const promotedSourceNames = {};
  let promotedOfficial = 0; let promotedTrustedCommunity = 0; let promotedMultiSource = 0;
  for (const c of candidates) {
    if (promotedRows.length >= desiredAdds) break;
    if (existingNumbers.has(c.number)) continue;
    existingNumbers.add(c.number);
    promotedRows.push({
      number: c.number,
      label: String(c.item.label || 'suspicious'),
      tag: c.tag,
      country: c.item.country || 'MX',
      sourceName: c.sourceName,
      sourceUrl: c.sourceUrl,
      sourceType: c.sourceType,
      confidence: c.confidence,
      note: c.note,
      updatedAt: c.item.updatedAt || new Date().toISOString(),
      lastUpdated: new Date().toISOString()
    });
    promotedSourceNames[c.sourceName] = (promotedSourceNames[c.sourceName] || 0) + 1;
    if (c.tier === 'official') promotedOfficial++;
    if (c.tier === 'trustedCommunity') promotedTrustedCommunity++;
    if (c.tier === 'multiSource') promotedMultiSource++;
  }

  const next = current.concat(promotedRows);
  if (next.length > HARD_MAX_SCAM_COUNT) throw new Error(`scam_numbers.json exceeded limit: ${next.length} > ${HARD_MAX_SCAM_COUNT}`);

  fs.mkdirSync(path.dirname(BACKUP), { recursive: true });
  fs.writeFileSync(BACKUP, `${JSON.stringify(current, null, 2)}\n`, 'utf8');
  fs.writeFileSync(TMP, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  fs.renameSync(TMP, SCAM);

  const iosMap = new Set(ios.map((r) => String(r.number)));
  const iosAppends = [];
  for (const row of promotedRows) {
    const n10 = normalizeForIos(row.number);
    if (!/^\d{10}$/.test(n10) || /^(911|089|088|070|072|800|01800)/.test(n10)) continue;
    if (!iosMap.has(n10)) {
      iosMap.add(n10);
      iosAppends.push({ number: n10, label: 'Número sospechoso', updatedAt: new Date().toISOString().slice(0, 10) });
    }
  }
  const iosNext = ios.concat(iosAppends);
  fs.writeFileSync(IOS, `${JSON.stringify(iosNext, null, 2)}\n`, 'utf8');

  report.previousOfficialCount = previousOfficialCount;
  report.newOfficialCount = next.length;
  report.promotedThisRun = promotedRows.length;
  report.maxPromoteLimit = MAX_PROMOTE;
  report.previousIosCount = previousIosCount;
  report.newIosCount = iosNext.length;
  report.promotedTotal = promotedRows.length;
  report.promotedOfficial = promotedOfficial;
  report.promotedTrustedCommunity = promotedTrustedCommunity;
  report.promotedMultiSource = promotedMultiSource;
  report.rejectedServiceNumbers = rejectedServiceNumbers;
  report.rejectedMissingSource = rejectedMissingSource;
  report.rejectedInvalidMX = rejectedInvalidMX;
  report.finalScamCount = next.length;
  report.finalIosCount = iosNext.length;
  report.reached5000 = next.length >= 5000;
  report.promotedSourceNames = promotedSourceNames;
  fs.writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  const topSourceNames = Object.entries(promotedSourceNames).sort((a, b) => b[1] - a[1]).slice(0, 20);
  console.log(`Promoted this run: ${promotedRows.length}`);
  console.log(`promotedOfficial=${promotedOfficial}, promotedTrustedCommunity=${promotedTrustedCommunity}, promotedMultiSource=${promotedMultiSource}`);
  console.log(`Top source names: ${JSON.stringify(topSourceNames)}`);
  console.log(`Rejected service=${rejectedServiceNumbers}, missingSource=${rejectedMissingSource}, invalidMX=${rejectedInvalidMX}`);
}

if (require.main === module) run();
module.exports = { run };
