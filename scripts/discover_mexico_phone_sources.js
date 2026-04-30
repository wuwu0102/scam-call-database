const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const CATALOG_PATH = path.join(DATA_DIR, 'source_catalog_mexico.json');
const args = process.argv.slice(2);
const MAX_ADD = Number((args.find(a => a.startsWith('--max-add=')) || '--max-add=300').split('=')[1]);
const MAX_PAGES = 20;
const QUERIES = [
  "site:tellows.mx México extorsión teléfono",
  "site:tellows.mx México fraude teléfono",
  "site:tellows.mx número sospechoso México",
  "site:quienhabla.mx teléfono sospechoso",
  "site:quienhabla.mx extorsión",
  "site:listaspam.com México extorsión",
  "site:listaspam.com México fraude",
  "número sospechoso México teléfono",
  "teléfono reportado extorsión México",
  "números usados para extorsión México",
  "lista números extorsión México",
  "números fraude WhatsApp México",
  "números usados para extorsión México",
  "lista de números extorsión telefónica México",
  "números telefónicos falsos México",
  "números de fraude telefónico México",
  "números sospechosos extorsión México",
  "teléfonos reportados por extorsión México",
  "números usados para secuestro virtual México",
  "números falsos SAT México",
  "números falsos banco México fraude",
  "números fraude WhatsApp México",
  "site:gob.mx números extorsión telefónica",
  "site:gob.mx números fraude telefónico",
  "site:*.gob.mx extorsión números",
  "site:*.gob.mx fraude telefónico números",
  "site:fiscalia*.gob.mx extorsión números",
  "site:seguridad*.gob.mx extorsión números",
  "site:ssp*.gob.mx extorsión números",
  "site:tellows.mx extorsión México teléfono",
  "site:quienhabla.mx número sospechoso México",
  "site:listaspam.com México teléfono extorsión"
];

const ua = { 'User-Agent': 'Mozilla/5.0 Chrome Safari', 'Accept-Language': 'es-MX,es;q=0.9,en;q=0.8' };
const isHttp = (u) => /^https?:\/\//i.test(String(u || ''));
const readArr = (p) => fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : [];
const writeArr = (p, data) => fs.writeFileSync(p, `${JSON.stringify(data, null, 2)}\n`);

function classify(url) {
  const u = url.toLowerCase();
  if (/(gob\.mx|fiscalia|seguridad|ssp|policia|condusef|profeco)/.test(u)) {
    return { type: 'official', confidence: 'medium', tag: 'scam' };
  }
  if (/(tellows|quienhabla|listaspam|quien-llama)/.test(u)) {
    return { type: 'crowd', confidence: 'low', tag: 'suspicious' };
  }
  return { type: 'media', confidence: 'medium', tag: 'suspicious' };
}

function parseResultUrls(html) {
  const hits = new Set();
  const re = /<a[^>]+href="([^"]+)"/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const href = m[1];
    if (href.startsWith('http://') || href.startsWith('https://')) hits.add(href.split('#')[0]);
    if (href.startsWith('/l/?kh=')) {
      const mm = href.match(/[?&]uddg=([^&]+)/);
      if (mm) {
        const decoded = decodeURIComponent(mm[1]);
        if (isHttp(decoded)) hits.add(decoded.split('#')[0]);
      }
    }
  }
  return Array.from(hits);
}

async function searchDDG(query) {
  const all = new Set();
  for (let page = 0; page < MAX_PAGES; page++) {
    const start = page * 30;
    const url = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}&s=${start}`;
    const res = await fetch(url, { headers: ua });
    if (!res.ok) throw new Error(`DDG ${res.status}`);
    const urls = parseResultUrls(await res.text());
    if (!urls.length) break;
    const before = all.size;
    urls.forEach((u)=>all.add(u));
    if (all.size === before) break;
    if (all.size >= MAX_ADD) break;
  }
  return Array.from(all);
}

(async () => {
  const old = readArr(CATALOG_PATH);
  const seen = new Set(old.map((x) => String(x.url || '').trim()));
  const today = new Date().toISOString().slice(0, 10);
  const added = [];

  for (const q of QUERIES) {
    if (added.length >= MAX_ADD) break;
    try {
      const urls = await searchDDG(q);
      if (!urls.length) console.warn(`warning: no results for query: ${q}`);
      for (const url of urls) {
        if (added.length >= MAX_ADD) break;
        if (!isHttp(url) || seen.has(url)) continue;
        seen.add(url);
        const rule = classify(url);
        added.push({
          name: 'auto discovered source',
          url,
          type: rule.type,
          confidence: rule.confidence,
          tag: rule.tag,
          label: 'Número sospechoso',
          autoImport: true,
          discoveredAt: today
        });
      }
    } catch (e) {
      console.warn(`warning: failed query "${q}": ${e.message}`);
    }
  }

  const merged = [...old, ...added];
  writeArr(CATALOG_PATH, merged);
  console.log(`source discovery done. added=${added.length} total=${merged.length}`);
})();
