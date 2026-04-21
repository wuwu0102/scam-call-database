const fs = require('fs');
const path = require('path');

function lookupPhoneNumber(phoneNumber) {
  const dataPath = path.join(__dirname, 'scam_numbers.json');
  const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

  const record = data.records.find((item) => item.phone === phoneNumber);

  if (!record) {
    return {
      label: 'unknown',
      tag: {
        'zh-TW': '未知',
        en: 'Unknown',
        'es-MX': 'Desconocido'
      }
    };
  }

  return {
    label: record.label,
    tag: record.tag
  };
}

// Example usage
console.log(lookupPhoneNumber('+1-202-555-0101'));
console.log(lookupPhoneNumber('+1-202-555-9999'));

module.exports = { lookupPhoneNumber };
