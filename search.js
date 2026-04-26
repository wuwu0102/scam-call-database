const COLLECTION_NAME = 'phone_numbers';

const UNKNOWN_RESULT = {
  label: 'unknown',
  tag: 'unknown',
  note: '',
  confidence: '',
  display: {
    'zh-TW': '未知',
    en: 'Unknown',
    'es-MX': 'Desconocido'
  }
};

function normalizeMXNumber(input) {
  if (!input) return '';

  let num = String(input).replace(/\D/g, '');

  if (num.length === 12 && num.startsWith('52')) {
    num = num.slice(2);
  }

  if (num.length === 13 && num.startsWith('521')) {
    num = num.slice(3);
  }

  if (num.length > 10) {
    num = num.slice(-10);
  }

  return num;
}

function isValidMXNumber(num) {
  return /^\d{10}$/.test(num);
}

async function lookupPhoneNumber(phoneNumber, options = {}) {
  const normalizedNumber = normalizeMXNumber(phoneNumber);
  if (!isValidMXNumber(normalizedNumber)) {
    return { ...UNKNOWN_RESULT };
  }

  const {
    db,
    collectionFn,
    queryFn,
    whereFn,
    limitFn,
    getDocsFn
  } = options;

  let firestoreDb = db;
  let collectionImpl = collectionFn;
  let queryImpl = queryFn;
  let whereImpl = whereFn;
  let limitImpl = limitFn;
  let getDocsImpl = getDocsFn;

  if (!firestoreDb || !collectionImpl || !queryImpl || !whereImpl || !limitImpl || !getDocsImpl) {
    try {
      // Lazy-load to keep compatibility with environments that inject Firestore helpers.
      // eslint-disable-next-line global-require
      const firestore = require('firebase/firestore');
      firestoreDb = firestoreDb || firestore.getFirestore();
      collectionImpl = collectionImpl || firestore.collection;
      queryImpl = queryImpl || firestore.query;
      whereImpl = whereImpl || firestore.where;
      limitImpl = limitImpl || firestore.limit;
      getDocsImpl = getDocsImpl || firestore.getDocs;
    } catch {
      return { ...UNKNOWN_RESULT };
    }
  }

  try {
    const searchQuery = queryImpl(
      collectionImpl(firestoreDb, COLLECTION_NAME),
      whereImpl('normalizedNumber', '==', normalizedNumber),
      limitImpl(1)
    );

    const snapshot = await getDocsImpl(searchQuery);
    if (!snapshot || snapshot.empty) {
      return { ...UNKNOWN_RESULT };
    }

    const firstDoc = snapshot.docs[0];
    const record = firstDoc && typeof firstDoc.data === 'function' ? firstDoc.data() : null;

    if (!record) {
      return { ...UNKNOWN_RESULT };
    }

    return {
      label: record.tag || 'unknown',
      tag: record.tag || 'unknown',
      note: record.note || '',
      confidence: record.confidence || '',
      display: record.label || UNKNOWN_RESULT.display
    };
  } catch {
    return { ...UNKNOWN_RESULT };
  }
}

module.exports = {
  COLLECTION_NAME,
  normalizeMXNumber,
  isValidMXNumber,
  lookupPhoneNumber,
  UNKNOWN_RESULT
};
