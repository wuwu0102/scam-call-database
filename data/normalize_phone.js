function normalizeMexicoPhone(number) {
  const digits = String(number || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 10) return `52${digits}`;
  return digits;
}

module.exports = {
  normalizeMexicoPhone,
};
