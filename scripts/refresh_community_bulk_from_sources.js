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
const USER_AGENT = 'Mozilla/5.0';
const FETCH_TIMEOUT_MS = 20000;
const MAX_RETRIES = 2;
const MAX_RUN_MS = 7 * 60 * 1000;
const START_MS = Date.now();

const BAD_TOKENS = new Set(['911','089','088','070','072','332','3347','26262','45578','569','6900000','34567890']);

const parseCsvLine = (l) => { const o = []; let c = ''; let q = false; for (let i = 0; i < l.length; i++) { const ch = l[i]; if (ch === '"') { if (q && l[i + 1] === '"') { c += '"'; i += 1; } else q = !q; } else if (ch === ',' && !q) { o.push(c); c = ''; } else c += ch; } o.push(c); return o; };
const toCsvLine = (r) => r.map((v) => { const t = String(v ?? ''); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; }).join(',');

const normalizeLocal10 = (input) => {
  const raw = String(input || '');
  const d = raw.replace(/\D/g, '');
  let local = null;
  const noSpace = raw.replace(/\s+/g, '');
  if (/^\+52\d{10}$/.test(noSpace)) local = noSpace.slice(3);
  else if (/^52\d{10}$/.test(d)) local = d.slice(2);
  else if (/^\d{10}$/.test(d)) local = d;
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

const classifyFromText = (text, fallback = 'spam') => {
  const t = String(text || '').toLowerCase();
  if (/estafa|fraude|phishing|extorsi[oó]n/.test(t)) return 'scam';
  if (/cobranza|deuda|banco|cr[eé]dito|tarjeta/.test(t)) return 'cobranza';
  if (/publicidad|ventas|telemarketing/.test(t)) return 'telemarketing';
  if (/whatsapp|denuncias de mensajes whatsapp/.test(t)) return 'whatsapp';
  if (/denuncias de mensajes sms|\bsms\b/.test(t)) return 'sms';
  if (/robocalls|acoso|llamadas sospechosas|denuncias de llamadas telef[oó]nicas/.test(t)) return 'spam';
  return fallback;
};

const genericCandidates = (html) => {
  const out = [];
  const re = /\+?52?[\d\s()\-]{10,26}|\d{10,30}/g;
  for (const m of html.matchAll(re)) {
    const token = m[0];
    const digits = token.replace(/\D/g, '');
    if (digits.length > 13) {
      for (let i = 0; i <= digits.length - 10; i++) out.push({ raw: digits.slice(i, i + 10), context: token });
    } else out.push({ raw: token, context: token });
  }
  return out;
};

const extractLinks = (html, pattern) => {
  const links = new Set();
  for (const m of html.matchAll(/href=["']([^"']+)["']/gi)) {
    const href = m[1];
    if (pattern.test(href)) links.add(href.startsWith('http') ? href : `https://www.numerostelefono.com${href}`);
  }
  return [...links];
};

const fetchWithRetry = (url) => new Promise((resolve, reject) => {
  let attempt = 1;
  const go = () => {
    const req = https.get(url, { timeout: FETCH_TIMEOUT_MS, headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'es-MX,es;q=0.9' } }, (res) => {
      const code = res.statusCode || 0;
      if (code >= 400) { res.resume(); const err = new Error(`HTTP ${code}`); err.statusCode = code; req.destroy(err); return; }
      let html = ''; res.on('data', (d) => { html += d; }); res.on('end', () => resolve({ html, attempts: attempt }));
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', (err) => {
      if (attempt < MAX_RETRIES) { attempt += 1; setTimeout(go, 200 * attempt); return; }
      reject(Object.assign(err, { attempts: attempt }));
    });
  };
  go();
});

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

  const report = { refreshedAt: new Date().toISOString(), sourcesTried: 0, sourcesSucceeded: 0, sourcesFailed: 0, rawCandidates: 0, validCandidates: 0, addedToCsv: 0, existingInCsv: 0, existingInPending: 0, existingInOfficial: 0, skippedInvalid: 0, blocked403: false, categoryBreakdown: {}, pageResults: [], stoppedEarlyReason: null, detailPagesFetched: 0 };

  const stopIfTimeout = () => {
    if (Date.now() - START_MS > MAX_RUN_MS) { report.stoppedEarlyReason = 'maxRunMs reached'; return true; }
    return false;
  };

  const addCandidate = (local, sourceName, url, note, confidence, category) => {
    const e164 = toE164(local);
    if (scamSet.has(e164)) { report.existingInOfficial += 1; return false; }
    if (pendingSet.has(e164)) { report.existingInPending += 1; return false; }
    if (seenLocal.has(local)) { report.existingInCsv += 1; return false; }
    rows.push([local, 'suspicious', sourceName, url, inferRegion(local), note, String(confidence), category]);
    seenLocal.add(local);
    report.validCandidates += 1;
    report.addedToCsv += 1;
    report.categoryBreakdown[category] = (report.categoryBreakdown[category] || 0) + 1;
    return true;
  };

  const processPage = async ({ sourceName, url, defaultCategory, confidence, note, maxPerPage = 100, discoverDetail = false }) => {
    const page = { sourceName, url, fetchOk: false, added: 0, error: null, attempts: 0, blocked403: false };
    try {
      const { html, attempts } = await fetchWithRetry(url);
      page.fetchOk = true; page.attempts = attempts;
      const pageCategory = classifyFromText(html, defaultCategory);
      const candidates = genericCandidates(html).slice(0, maxPerPage);
      report.rawCandidates += candidates.length;
      for (const c of candidates) {
        const local = normalizeLocal10(c.raw);
        if (!local) { report.skippedInvalid += 1; continue; }
        if (addCandidate(local, sourceName, url, note, confidence, pageCategory)) page.added += 1;
      }
      if (discoverDetail) {
        const detailLinks = extractLinks(html, /\/mx\/denuncias\/\d{10}\/?$/i);
        for (const detailUrl of detailLinks) detailQueue.add(detailUrl);
      }
    } catch (err) {
      page.error = err.message; page.attempts = err.attempts || MAX_RETRIES;
      if (/HTTP 403/.test(String(err.message))) { page.blocked403 = true; report.blocked403 = true; }
    }
    report.pageResults.push(page);
    return page;
  };

  const detailQueue = new Set();
  // Source A
  report.sourcesTried += 1;
  let okA = false; let zeroStreakA = 0;
  const aUrls = ['https://www.numerostelefono.com/mx/','https://www.numerostelefono.com/mx/mexico/',...Array.from({ length: 300 }, (_, i) => `https://www.numerostelefono.com/mx/page/${i + 1}/`)];
  for (const url of aUrls) {
    if (stopIfTimeout()) break;
    const page = await processPage({ sourceName: 'Números Teléfono México', url, defaultCategory: 'spam', confidence: 0.35, note: 'Reporte comunitario en México', discoverDetail: true });
    if (page.fetchOk) okA = true;
    zeroStreakA = page.added === 0 ? zeroStreakA + 1 : 0;
    if (zeroStreakA >= 10) { report.stoppedEarlyReason = report.stoppedEarlyReason || 'Números Teléfono México zero-add streak'; break; }
  }
  okA ? report.sourcesSucceeded++ : report.sourcesFailed++;

  // Source B SMS
  if (!stopIfTimeout()) {
    report.sourcesTried += 1;
    let okB = false;
    const smsBase = 'https://www.numerostelefono.com/mx/denuncia-numero-sms/';
    const first = await processPage({ sourceName: 'Números Teléfono México SMS', url: smsBase, defaultCategory: 'sms', confidence: 0.35, note: 'Community SMS report in Mexico' });
    if (first.fetchOk) okB = true;
    const smsLinks = first.fetchOk ? extractLinks((await fetchWithRetry(smsBase)).html, /denuncia-numero-sms\/page\//i) : [];
    const generated = Array.from({ length: 20 }, (_, i) => `https://www.numerostelefono.com/mx/denuncia-numero-sms/page/${i + 2}/`);
    for (const url of [...new Set([...generated, ...smsLinks])]) {
      if (stopIfTimeout()) break;
      const p = await processPage({ sourceName: 'Números Teléfono México SMS', url, defaultCategory: 'sms', confidence: 0.35, note: 'Community SMS report in Mexico' });
      if (p.fetchOk) okB = true;
    }
    okB ? report.sourcesSucceeded++ : report.sourcesFailed++;
  }

  // Source C detail
  if (!stopIfTimeout()) {
    report.sourcesTried += 1;
    let okC = false;
    let i = 0;
    for (const url of [...detailQueue].slice(0, 500)) {
      if (stopIfTimeout()) break;
      i += 1;
      const p = await processPage({ sourceName: 'Números Teléfono México', url, defaultCategory: 'spam', confidence: 0.45, note: 'Denuncia comunitaria de detalle', maxPerPage: 20 });
      if (p.fetchOk) okC = true;
      report.detailPagesFetched = i;
    }
    okC ? report.sourcesSucceeded++ : report.sourcesFailed++;
  }

  // TelefonoSpam
  if (!stopIfTimeout()) {
    report.sourcesTried += 1;
    let okT = false; let zeroStreak = 0;
    const urls = ['https://www.telefonospam.com.mx/top-spam', ...Array.from({ length: 59 }, (_, i) => `https://www.telefonospam.com.mx/top-spam/${i + 2}`)];
    for (const url of urls) {
      if (stopIfTimeout()) break;
      const p = await processPage({ sourceName: 'TelefonoSpam MX Top Spam', url, defaultCategory: 'spam', confidence: 0.45, note: 'Community top spam report' });
      if (p.fetchOk) okT = true;
      zeroStreak = p.added === 0 ? zeroStreak + 1 : 0;
      if (zeroStreak >= 8) { report.stoppedEarlyReason = report.stoppedEarlyReason || 'TelefonoSpam MX Top Spam zero-add streak'; break; }
    }
    okT ? report.sourcesSucceeded++ : report.sourcesFailed++;
  }

  // LADA + Tellows
  for (const source of [
    { name: 'LADA México Spam Telefónico', urls: ['https://telefonos.lada-mexico.com/','https://www.lada-mexico.com/telefono/'], cat: 'spam', conf: 0.35, note: 'Public spam phone list from LADA México' },
    { name: 'Tellows MX', urls: ['https://www.tellows.mx/'], cat: 'spam', conf: 0.35, note: 'Reporte comunitario' }
  ]) {
    if (stopIfTimeout()) break;
    report.sourcesTried += 1; let ok = false;
    for (const url of source.urls) {
      if (stopIfTimeout()) break;
      const p = await processPage({ sourceName: source.name, url, defaultCategory: source.cat, confidence: source.conf, note: source.note });
      if (p.fetchOk) ok = true;
      if (source.name === 'Tellows MX' && p.blocked403) break;
    }
    ok ? report.sourcesSucceeded++ : report.sourcesFailed++;
  }

  fs.writeFileSync(CSV, HEADER + '\n' + rows.map(toCsvLine).join('\n') + '\n');
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2) + '\n');
})();
