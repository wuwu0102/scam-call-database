const INVALID_LOCALS = new Set(['0000000000','1111111111','1234567890','5555555555','9999999999']);
function normalizeMexicoPhone(raw) {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, '');
  let local = null;
  if (digits.length === 10) local = digits;
  else if (digits.length === 12 && digits.startsWith('52')) local = digits.slice(2);
  else if (digits.length === 13 && digits.startsWith('521')) local = digits.slice(3);
  else return null;
  if (!local || INVALID_LOCALS.has(local) || /^(\d)\1{9}$/.test(local)) return null;
  return `+52${local}`;
}
module.exports = { normalizeMexicoPhone };
