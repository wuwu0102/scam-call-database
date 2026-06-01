const DISPLAY_LABELS = Object.freeze({
  scam: 'Posible fraude',
  suspicious: 'Número sospechoso',
  safe: 'Número confiable',
  unknown: 'Información de referencia'
});

const TAG_RULES = Object.freeze([
  {
    tag: 'scam',
    aliases: ['scam', 'fraud', 'fraude', 'estafa', 'phishing', 'suplantacion', 'suplantación', 'extorsion', 'extorsión'],
    riskTags: ['fraud']
  },
  {
    tag: 'suspicious',
    aliases: ['suspicious', 'sospechoso', 'sospechosa', 'spam', 'telemarketing', 'marketing', 'publicidad', 'promocion', 'promoción', 'whatsapp', 'sms'],
    riskTags: ['spam']
  },
  {
    tag: 'suspicious',
    aliases: ['debt_collection', 'cobranza', 'deuda', 'adeudo', 'mora', 'cobrador'],
    riskTags: ['debt_collection']
  },
  {
    tag: 'safe',
    aliases: ['safe', 'seguro', 'confiable', 'verified_safe'],
    riskTags: ['safe']
  },
  {
    tag: 'unknown',
    aliases: ['unknown', 'desconocido', 'reference', 'referencia'],
    riskTags: ['unknown']
  }
]);

function flattenText(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return Object.values(value).map(flattenText).join(' ');
  return String(value);
}

function normalizeToken(value) {
  return flattenText(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function normalizeLegacyTag(record = {}) {
  const candidates = [record.tag, record.category, record.riskType, record.label, record.note];
  const text = normalizeToken(candidates.filter(Boolean).join(' '));
  if (!text) return 'unknown';

  for (const rule of TAG_RULES) {
    if (rule.aliases.some((alias) => text.includes(normalizeToken(alias)))) return rule.tag;
  }
  return 'unknown';
}

function riskTagsForRecord(record = {}) {
  const text = normalizeToken([record.tag, record.category, record.riskType, record.label, record.note].filter(Boolean).join(' '));
  const tags = new Set();
  for (const rule of TAG_RULES) {
    if (rule.aliases.some((alias) => text.includes(normalizeToken(alias)))) {
      rule.riskTags.forEach((tag) => tags.add(tag));
    }
  }
  if (!tags.size) tags.add(normalizeLegacyTag(record));
  return Array.from(tags).filter(Boolean);
}

function displayLabelForTag(tag) {
  return DISPLAY_LABELS[tag] || DISPLAY_LABELS.unknown;
}

function buildClassification(record = {}) {
  const legacyTag = normalizeLegacyTag(record);
  return {
    schemaVersion: 1,
    legacyTag,
    primaryTag: legacyTag,
    riskTags: riskTagsForRecord(record),
    displayLabel: displayLabelForTag(legacyTag),
    compatibility: {
      preservesFields: ['number', 'label', 'tag'],
      firestoreCollections: ['phone_numbers', 'phone_number_reports'],
      iosExportFields: ['number', 'label']
    }
  };
}

function applyClassificationCompat(record = {}) {
  const classification = buildClassification(record);
  return {
    ...record,
    tag: record.tag || classification.legacyTag,
    label: record.label || classification.displayLabel,
    classification
  };
}

module.exports = {
  DISPLAY_LABELS,
  TAG_RULES,
  normalizeLegacyTag,
  riskTagsForRecord,
  displayLabelForTag,
  buildClassification,
  applyClassificationCompat
};
