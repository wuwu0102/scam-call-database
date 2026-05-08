#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = process.cwd();
const CSV = path.join(ROOT, 'data', 'community_bulk_import_numbers.csv');
const PENDING = path.join(ROOT, 'data', 'pending_numbers.json');
const SCAM = path.join(ROOT, 'scam_numbers.json');
const REPORT = path.join(ROOT, 'data', 'community_bulk_refresh_report.json');

const HEADER = 'number,label,sourceName,sourceUrl,region,note,confidence,category';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const FETCH_TIMEOUT_MS = 20000;
const MAX_RETRIES = 3;
const BAD_TOKENS = new Set(['911','089','088','070','072','332','3347','26262','45578','569','6900000','34567890']);

const TELEFONO_SPAM_URLS = Array.from({ length: 20 }, (_, i) => i === 0 ?
  'https://www.telefonospam.com.mx/top-spam' :
  `https://www.telefonospam.com.mx/top-spam/${i + 1}`);

const SOURCES = [
  { name: 'TelefonoSpam MX Top Spam', urls: TELEFONO_SPAM_URLS, category: 'spam', confidence: 0.45, note: 'Top spam reportado por comunidad', parser: 'generic' },
  { name: 'LADA México Spam Telefónico', urls: ['https://telefonos.lada-mexico.com/'], category: 'spam', confidence: 0.35, note: 'Public spam phone list from LADA México', parser: 'lada' },
  { name: 'Números Teléfono México', urls: ['https://www.numerostelefono.com/mx/'], category: 'spam', confidence: 0.35, note: 'Community phone reports in Mexico', parser: 'numerostelefono' },
  { name: 'Tellows MX', urls: ['https://www.tellows.mx/'], category: 'spam', confidence: 0.35, note: 'Reporte comunitario', parser: 'generic' }
];

const parseCsvLine = (l) => { const o = []; let c = ''; let q = false; for (let i = 0; i < l.length; i++) { const ch = l[i]; if (ch === '"') { if (q && l[i + 1] === '"') { c += '"'; i += 1; } else q = !q; } else if (ch === ',' && !q) { o.push(c); c = ''; } else c += ch; } o.push(c); return o; };
const toCsvLine = (r) => r.map((v) => { const t = String(v ?? ''); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; }).join(',');

const fetchWithRetry = (url) => new Promise((resolve, reject) => {
  let attempt = 1;
  const go = () => {
    const req = https.get(url, { timeout: FETCH_TIMEOUT_MS, headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'es-MX,es;q=0.9,en;q=0.8', 'Accept': 'text/html,application/xhtml+xml' } }, (res) => {
      const code = res.statusCode || 0;
      if (code >= 400) { res.resume(); const err = new Error(`HTTP ${code}`); err.statusCode = code; req.destroy(err); return; }
      let html = ''; res.on('data', (d) => { html += d; }); res.on('end', () => resolve({ html, attempts: attempt }));
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', (err) => {
      if (attempt < MAX_RETRIES) { attempt += 1; setTimeout(go, attempt * 250); return; }
      reject(Object.assign(err, { attempts: attempt }));
    });
  };
  go();
});

const normalizeLocal10 = (input) => {
  const raw = String(input || '');
  const d = raw.replace(/\D/g, '');
  let local = null;
  if (/^\+52\d{10}$/.test(raw.replace(/\s+/g, ''))) local = raw.replace(/\D/g, '').slice(2);
  else if (d.length === 10) local = d;
  else if (d.length === 12 && d.startsWith('52')) local = d.slice(2);
  if (!local || !/^\d{10}$/.test(local)) return null;
  if (new Set(local).size === 1 || local === '1234567890' || local === '0000000000') return null;
  if (local.startsWith('800')) return null;
  if (BAD_TOKENS.has(local) || local.startsWith('01800')) return null;
  return local;
};

const toE164 = (local10) => `+52${local10}`;
const inferRegion = (n) => {
  const p3 = n.slice(0, 3); const p2 = n.slice(0, 2);
  const m3 = { '222': 'Puebla', '221': 'Puebla', '231': 'Puebla', '664': 'Baja California', '477': 'Guanajuato', '442': 'Querétaro', '999': 'Yucatán', '228': 'Veracruz', '229': 'Veracruz', '667': 'Sinaloa', '668': 'Sinaloa', '844': 'Coahuila', '871': 'Coahuila', '444': 'San Luis Potosí', '488': 'San Luis Potosí', '483': 'San Luis Potosí', '981': 'Campeche', '993': 'Tabasco', '961': 'Chiapas', '963': 'Chiapas', '967': 'Chiapas', '722': 'Estado de México', '728': 'Estado de México', '777': 'Morelos', '744': 'Guerrero', '662': 'Sonora', '867': 'Tamaulipas', '312': 'Colima', '618': 'Durango', '771': 'Hidalgo', '443': 'Michoacán' };
  const m2 = { '33': 'Jalisco', '55': 'CDMX / Estado de México', '56': 'CDMX / Estado de México', '81': 'Nuevo León' };
  return m3[p3] || m2[p2] || 'México';
};

const classify = (s) => {
  const t = (s || '').toLowerCase();
  if (/estafa|fraude|phishing|extorsi/.test(t)) return 'scam';
  if (/cobranza|deuda|banco|crédito|credito/.test(t)) return 'cobranza';
  if (/publicidad|ventas|telemarketing/.test(t)) return 'telemarketing';
  if (/whatsapp|mensajes|sms|spam|robocalls|llamadas telefónicas/.test(t)) return 'spam';
  return 'spam';
};

const genericCandidates = (html) => {
  const out = [];
  const re = /\+?52?\s*[\d\s()\-]{10,24}|\d{10,20}/g;
  for (const m of html.matchAll(re)) {
    const token = m[0];
    const digits = token.replace(/\D/g, '');
    if (digits.length >= 20) {
      for (let i = 0; i <= digits.length - 10; i += 10) out.push({ raw: digits.slice(i, i + 10), context: token });
    } else out.push({ raw: token, context: token });
  }
  return out;
};

(async () => {
  const scamSet = new Set((JSON.parse(fs.readFileSync(SCAM, 'utf8')) || []).map((x) => x.number));
  const pendingSet = new Set((fs.existsSync(PENDING) ? JSON.parse(fs.readFileSync(PENDING, 'utf8')) : []).map((x) => x.number));

  let rows = [];
  if (fs.existsSync(CSV)) {
    const lines = fs.readFileSync(CSV, 'utf8').split(/\r?\n/).filter(Boolean);
    for (let i = 1; i < lines.length; i++) {
      const c = parseCsvLine(lines[i]); if (c.length < 7) continue;
      rows.push(c.length >= 8 ? c : [c[0], c[1], c[2], c[3], c[4], c[5], c[6], 'spam']);
    }
  }
  const seenLocal = new Set(rows.map((r) => normalizeLocal10(r[0])).filter(Boolean));

  const report = { refreshedAt: new Date().toISOString(), sourcesTried: 0, sourcesSucceeded: 0, sourcesFailed: 0, rawCandidates: 0, validCandidates: 0, addedToCsv: 0, existingInCsv: 0, existingInPending: 0, existingInOfficial: 0, skippedInvalid: 0, blocked403: false, categoryBreakdown: {}, pageResults: [] };

  for (const source of SOURCES) {
    report.sourcesTried += 1;
    let sourceOk = false;
    for (const url of source.urls) {
      const page = { sourceName: source.name, url, fetchOk: false, added: 0, error: null, attempts: 0, blocked403: false };
      try {
        const { html, attempts } = await fetchWithRetry(url);
        page.fetchOk = true; page.attempts = attempts; sourceOk = true;

        const candidates = genericCandidates(html);
        report.rawCandidates += candidates.length;
        for (const c of candidates) {
          const local = normalizeLocal10(c.raw);
          if (!local) { report.skippedInvalid += 1; continue; }
          const e164 = toE164(local);
          if (scamSet.has(e164)) { report.existingInOfficial += 1; continue; }
          if (pendingSet.has(e164)) { report.existingInPending += 1; continue; }
          if (seenLocal.has(local)) { report.existingInCsv += 1; continue; }
          const category = source.parser === 'numerostelefono' ? classify(c.context) : source.category;
          rows.push([local, 'suspicious', source.name, url, inferRegion(local), source.note, String(source.confidence), category]);
          seenLocal.add(local);
          report.validCandidates += 1;
          report.addedToCsv += 1;
          page.added += 1;
          report.categoryBreakdown[category] = (report.categoryBreakdown[category] || 0) + 1;
        }
      } catch (err) {
        page.error = err.message; page.attempts = err.attempts || MAX_RETRIES;
        if (source.name === 'Tellows MX' && /HTTP 403/.test(String(err.message))) {
          page.blocked403 = true; report.blocked403 = true;
        }
      }
      report.pageResults.push(page);
    }
    if (sourceOk) report.sourcesSucceeded += 1; else report.sourcesFailed += 1;
  }

  fs.writeFileSync(CSV, HEADER + '\n' + rows.map(toCsvLine).join('\n') + '\n');
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2) + '\n');
})();
