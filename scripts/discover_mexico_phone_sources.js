const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const CATALOG = path.join(DATA_DIR, 'source_catalog_mexico.json');
const MAX_ADD = 100;

const queries = [
  'números usados para extorsión México',
  'lista de números extorsión telefónica México',
  'números telefónicos falsos México',
  'números de fraude telefónico México',
  'números sospechosos extorsión México',
  'teléfonos reportados por extorsión México',
  'números usados para secuestro virtual México',
  'números falsos SAT México',
  'números falsos banco México fraude',
  'números fraude WhatsApp México',
  'site:gob.mx números extorsión telefónica',
  'site:*.gob.mx números extorsión',
  'site:*.gob.mx números fraude telefónico',
  'site:fiscalia*.gob.mx extorsión números',
  'site:seguridad*.gob.mx extorsión números'
];

const readArray = (p) => fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : [];
const writeArray = (p, data) => fs.writeFileSync(p, JSON.stringify(data, null, 2) + '\n');

const isHttp = (u) => /^https?:\/\//i.test(u || '');
const badBinary = /\.(zip|rar|7z|tar|gz|dmg|exe|apk|mp3|mp4|avi|mov|pptx?|xlsx?|docx?)(\?|#|$)/i;

function classify(url) {
  const u = String(url).toLowerCase();
  if (u.includes('gob.mx') || u.includes('fiscalia') || u.includes('seguridad') || u.includes('policia')) return { type: 'government', confidence: 'high', tag: 'scam' };
  if (u.includes('tellows') || u.includes('quienhabla') || u.includes('listaspam')) return { type: 'crowd', confidence: 'low', tag: 'suspicious' };
  return { type: 'media', confidence: 'medium', tag: 'suspicious' };
}

function parseUrls(html) {
  const urls = new Set();
  const m = String(html || '').match(/https?:\/\/[^\s"'<>]+/g) || [];
  for (const raw of m) {
    const cleaned = raw.replace(/[),.;]+$/, '');
    if (!isHttp(cleaned)) continue;
    if (badBinary.test(cleaned)) continue;
    urls.add(cleaned);
  }
  return Array.from(urls);
}

async function searchDuckDuckGo(query) {
  const u = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const r = await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'es-MX,es;q=0.9' } });
  if (!r.ok) throw new Error(`duckduckgo HTTP ${r.status}`);
  return parseUrls(await r.text());
}

async function searchBing(query) {
  const u = `https://www.bing.com/search?q=${encodeURIComponent(query)}`;
  const r = await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'es-MX,es;q=0.9' } });
  if (!r.ok) throw new Error(`bing HTTP ${r.status}`);
  return parseUrls(await r.text());
}

(async () => {
  const catalog = readArray(CATALOG);
  const existing = new Set(catalog.map((r) => String(r.url || '').trim()));
  const discovered = [];
  const warnings = [];

  for (const q of queries) {
    let urls = [];
    try { urls = urls.concat(await searchDuckDuckGo(q)); } catch (e) { warnings.push(`DDG blocked for "${q}": ${e.message}`); }
    try { urls = urls.concat(await searchBing(q)); } catch (e) { warnings.push(`Bing blocked for "${q}": ${e.message}`); }

    for (const url of urls) {
      if (discovered.length >= MAX_ADD) break;
      if (!isHttp(url) || badBinary.test(url) || existing.has(url)) continue;
      existing.add(url);
      const rule = classify(url);
      discovered.push({
        name: `Discovered source (${new URL(url).hostname})`,
        url,
        type: rule.type,
        confidence: rule.confidence,
        tag: rule.tag,
        label: rule.tag === 'scam' ? 'Posible fraude' : 'Número sospechoso',
        autoImport: true
      });
    }
  }

  const merged = [...catalog, ...discovered];
  writeArray(CATALOG, merged);
  for (const w of warnings) console.warn('WARN', w);
  console.log(`Catalog merged. Added ${discovered.length} sources. total=${merged.length}`);
})();
