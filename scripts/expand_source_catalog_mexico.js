const fs = require('fs');
const path = require('path');

const catalogPath = path.join(__dirname, '..', 'data', 'source_catalog_mexico.json');
const fixed = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));

function readExisting() {
  if (!fs.existsSync(catalogPath)) return [];
  const parsed = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  return Array.isArray(parsed) ? parsed : [];
}

function normalize(item) {
  const type = String(item.type || 'media').toLowerCase();
  return {
    name: String(item.name || '').trim(),
    url: String(item.url || '').trim(),
    type,
    confidence: ['high', 'medium'].includes(String(item.confidence || '').toLowerCase()) ? String(item.confidence).toLowerCase() : 'medium',
    tag: type === 'media' ? 'suspicious' : (String(item.tag || '').toLowerCase() === 'scam' ? 'scam' : 'suspicious'),
    label: type === 'media' ? 'Número sospechoso' : (String(item.tag || '').toLowerCase() === 'scam' ? 'Posible fraude' : 'Número sospechoso'),
    autoImport: item.autoImport !== false,
  };
}

const byUrl = new Map();
const byName = new Set();
[...readExisting(), ...fixed].map(normalize).forEach((item) => {
  if (!item.name || !/^https?:\/\//.test(item.url)) return;
  const nameKey = item.name.toLowerCase();
  const urlKey = item.url.toLowerCase();
  if (byUrl.has(urlKey) || byName.has(nameKey)) return;
  byUrl.set(urlKey, item);
  byName.add(nameKey);
});

const output = Array.from(byUrl.values()).sort((a, b) => a.name.localeCompare(b.name, 'es'));
fs.writeFileSync(catalogPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
console.log(`Source catalog entries: ${output.length}`);
