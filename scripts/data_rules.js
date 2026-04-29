const TEST_NUMBERS = new Set(['2025550101','2025550102','2025550103','2025550104','2025550105']);
const BLOCKED_LOCAL_SOURCES = new Set(['local://ios_numbers', 'local://scam_numbers']);
const TRUSTED_TYPES = new Set(['official','government','police','media']);
const TRUSTED_CONFIDENCE = new Set(['high','medium']);
const TRUSTED_TAGS = new Set(['scam','suspicious']);

function normalizeMXNumber(input) {
  if (!input) return '';
  let num = String(input).replace(/\D/g, '');
  if (num.startsWith('521') && num.length >= 13) num = num.slice(3);
  else if (num.startsWith('52') && num.length >= 12) num = num.slice(2);
  if (num.length > 10) num = num.slice(-10);
  return num;
}

function isDateLike(n) {
  return /^(19|20)\d{2}(0[1-9]|1[0-2])([0-2]\d|3[0-1])$/.test(n) || /^(0[1-9]|[12]\d|3[01])(0[1-9]|1[0-2])(19|20)\d{2}$/.test(n);
}

function isValidNormalizedNumber(n) { return /^\d{10}$/.test(n); }
function isInvalidNumber(n) { return !isValidNormalizedNumber(n) || TEST_NUMBERS.has(n) || isDateLike(n); }
function isHttpUrl(u) { return /^https?:\/\//i.test(String(u || '').trim()); }

function sanitizeTag(rawTag, type) {
  if (rawTag && typeof rawTag === 'object') return null;
  const tag = String(rawTag || '').toLowerCase();
  if (tag === 'safe' || tag === 'unknown' || tag === 'crowd_signal') return null;
  if (type === 'media') return 'suspicious';
  return TRUSTED_TAGS.has(tag) ? tag : null;
}

module.exports = { TEST_NUMBERS, BLOCKED_LOCAL_SOURCES, TRUSTED_TYPES, TRUSTED_CONFIDENCE, TRUSTED_TAGS, normalizeMXNumber, isDateLike, isValidNormalizedNumber, isInvalidNumber, isHttpUrl, sanitizeTag };
