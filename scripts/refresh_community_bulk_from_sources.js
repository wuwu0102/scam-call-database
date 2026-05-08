#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const https = require('https');

(async () => {
  const ROOT = process.cwd();
  const CSV = path.join(ROOT, 'data', 'community_bulk_import_numbers.csv');
  const PENDING = path.join(ROOT, 'data', 'pending_numbers.json');
  const SCAM = path.join(ROOT, 'scam_numbers.json');
  const SNAP = path.join(ROOT, 'data', 'community_source_snapshots', 'community_signals_snapshot.csv');
  const REPORT = path.join(ROOT, 'data', 'community_bulk_refresh_report.json');

  const HEADER = 'number,label,sourceName,sourceUrl,region,note,confidence,category';
  const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
  const FETCH_TIMEOUT_MS = 20000;
  const MAX_RETRIES = 3;

  const SOURCES = [
    {
      name: 'TelefonoSpam MX',
      urls: [
        'https://www.telefonospam.com.mx/top-spam',
        'https://www.telefonospam.com.mx/top-spam/2',
        'https://www.telefonospam.com.mx/top-spam/3',
        'https://www.telefonospam.com.mx/top-spam/4',
        'https://www.telefonospam.com.mx/top-spam/5',
        'https://www.telefonospam.com.mx/pending',
        'https://www.telefonospam.com.mx/busqueda'
      ]
    },
    {
      name: 'Tellows MX',
      urls: ['https://www.tellows.mx/num/%2B52']
    }
  ];

  const parse = (l) => {
    const o = []; let c = ''; let q = false;
    for (let i = 0; i < l.length; i++) {
      const ch = l[i];
      if (ch === '"') { if (q && l[i + 1] === '"') { c += '"'; i++; } else q = !q; }
      else if (ch === ',' && !q) { o.push(c); c = ''; }
      else c += ch;
    }
    o.push(c);
    return o;
  };

  const toLine = (r) => r.map((v) => {
    const t = String(v ?? '');
    return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  }).join(',');

  const norm = (x) => {
    const d = String(x || '').replace(/\D/g, '');
    let l = '';
    if (d.length === 10) l = d;
    else if (d.length === 12 && d.startsWith('52')) l = d.slice(2);
    else return null;
    if (!/^\d{10}$/.test(l) || l.startsWith('800')) return null;
    return '+52' + l;
  };

  const infer = (t) => {
    const s = t.toLowerCase();
    if (/fraude|estafa|phishing/.test(s)) return 'fraud';
    if (/extorsi/.test(s)) return 'extortion';
    if (/robot|automática|automatica/.test(s)) return 'robocall';
    if (/cobranza|deuda|banco|crédito|credito/.test(s)) return 'cobranza';
    if (/telemarketing|ventas/.test(s)) return 'telemarketing';
    if (/publicidad/.test(s)) return 'publicidad';
    if (/spam|molestia|no deseado/.test(s)) return 'spam';
    return 'unknown';
  };

  const fetchWithRetry = (url) => new Promise((resolve, reject) => {
    let attempt = 1;
    const run = () => {
      const req = https.get(url, {
        timeout: FETCH_TIMEOUT_MS,
        headers: {
          'User-Agent': USER_AGENT,
          'Accept-Language': 'es-MX,es;q=0.9,en;q=0.8',
          'Accept': 'text/html,application/xhtml+xml'
        }
      }, (res) => {
        const code = res.statusCode || 0;
        if (code >= 400) {
          res.resume();
          const err = new Error(`HTTP ${code}`);
          err.statusCode = code;
          req.destroy(err);
          return;
        }
        let data = '';
        res.on('data', (ch) => { data += ch; });
        res.on('end', () => resolve({ data, attempts: attempt }));
      });

      req.on('timeout', () => req.destroy(new Error('timeout')));
      req.on('error', (err) => {
        if (attempt < MAX_RETRIES) {
          attempt += 1;
          return setTimeout(run, 300 * attempt);
        }
        return reject(Object.assign(err, { attempts: attempt }));
      });
    };

    try { run(); } catch (err) { reject(Object.assign(err, { attempts: attempt })); }
  });

  const report = {
    refreshedAt: new Date().toISOString(),
    usedFallbackSnapshot: false,
    fallbackSnapshotRows: 0,
    fallbackSnapshotAddedToCsv: 0,
    dnsFailures: 0,
    retryAttempts: 0,
    categoryBreakdown: {},
    sources: []
  };

  const scamSet = new Set((JSON.parse(fs.readFileSync(SCAM, 'utf8')) || []).map((x) => x.number));
  const pendingSet = new Set((fs.existsSync(PENDING) ? JSON.parse(fs.readFileSync(PENDING, 'utf8')) : []).map((x) => x.number));

  let rows = [];
  if (fs.existsSync(CSV)) {
    const lines = fs.readFileSync(CSV, 'utf8').split(/\r?\n/).filter(Boolean);
    for (let i = 1; i < lines.length; i++) {
      const c = parse(lines[i]);
      if (c.length < 7) continue;
      rows.push(c.length >= 8 ? c : [c[0], c[1], c[2], c[3], c[4], c[5], c[6], 'spam']);
    }
  }

  const seen = new Set(rows.map((r) => norm(r[0])).filter(Boolean));

  for (const source of SOURCES) {
    const sourceResult = { name: source.name, urls: source.urls, fetchOk: false, added: 0, error: null, blocked403: false };

    for (const url of source.urls) {
      const pageResult = { url, fetchOk: false, added: 0, error: null, attempts: 0 };
      try {
        const { data: html, attempts } = await fetchWithRetry(url);
        pageResult.fetchOk = true;
        pageResult.attempts = attempts;
        report.retryAttempts += Math.max(0, attempts - 1);
        sourceResult.fetchOk = true;

        const matches = html.match(/\+?\d[\d\s()\-]{7,20}\d|\b\d{10,12}\b/g) || [];
        for (const candidate of matches) {
          const n = norm(candidate);
          if (!n || seen.has(n) || scamSet.has(n) || pendingSet.has(n)) continue;
          const i = html.indexOf(candidate);
          const cat = infer(html.slice(Math.max(0, i - 120), i + 120));
          report.categoryBreakdown[cat] = (report.categoryBreakdown[cat] || 0) + 1;
          rows.push([n, 'suspicious', source.name, url, 'México', 'Reporte comunitario', cat === 'spam' ? 0.45 : 0.35, cat]);
          seen.add(n);
          pageResult.added += 1;
          sourceResult.added += 1;
        }
      } catch (e) {
        pageResult.error = e.message;
        pageResult.attempts = e.attempts || MAX_RETRIES;
        report.retryAttempts += Math.max(0, (e.attempts || MAX_RETRIES) - 1);
        if (String(e.message).includes('EAI_AGAIN')) report.dnsFailures += 1;
        if (/HTTP 403/.test(String(e.message)) && source.name === 'Tellows MX') {
          sourceResult.blocked403 = true;
          if (!sourceResult.error) sourceResult.error = 'HTTP 403 blocked, skipped';
          sourceResult.pageResults = sourceResult.pageResults || [];
          sourceResult.pageResults.push(pageResult);
          break;
        }
      }
      sourceResult.pageResults = sourceResult.pageResults || [];
      sourceResult.pageResults.push(pageResult);
    }

    report.sources.push(sourceResult);
  }

  if (report.sources.every((s) => !s.fetchOk) && fs.existsSync(SNAP)) {
    report.usedFallbackSnapshot = true;
    const l = fs.readFileSync(SNAP, 'utf8').split(/\r?\n/).filter(Boolean);
    report.fallbackSnapshotRows = Math.max(0, l.length - 1);
    for (let i = 1; i < l.length; i++) {
      const c = parse(l[i]); const n = norm(c[0]);
      if (!n || seen.has(n) || scamSet.has(n) || pendingSet.has(n)) continue;
      rows.push(c.length >= 8 ? c : [c[0], c[1], c[2], c[3], c[4], c[5], c[6], 'spam']);
      seen.add(n);
      report.fallbackSnapshotAddedToCsv += 1;
    }
  }

  fs.writeFileSync(CSV, HEADER + '\n' + rows.map(toLine).join('\n') + '\n');
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2) + '\n');
})();
