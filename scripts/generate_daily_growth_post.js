const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PUBLIC_STATS_PATH = path.join(ROOT, 'data', 'public_stats.json');
const SCAM_NUMBERS_PATH = path.join(ROOT, 'scam_numbers.json');
const OUTPUT_PATH = path.join(ROOT, 'reports', 'daily_growth_post.json');

function readJsonFileSafe(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      console.error(`[generate_daily_growth_post] Archivo no encontrado: ${filePath}`);
      return null;
    }

    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    console.error(`[generate_daily_growth_post] No se pudo leer JSON: ${filePath}`);
    console.error(error && error.message ? error.message : String(error));
    return null;
  }
}

function countCategories(entries) {
  const counters = {
    fraud: 0,
    spam: 0,
    debt_collection: 0,
  };

  if (!Array.isArray(entries)) {
    return counters;
  }

  for (const entry of entries) {
    const category = entry && typeof entry.category === 'string' ? entry.category : '';
    if (category === 'fraud' || category === 'spam' || category === 'debt_collection') {
      counters[category] += 1;
    }
  }

  return counters;
}

function buildPosts(totalSignals) {
  const suggestedPostShort = `Hoy Alerta Número MX monitorea ${totalSignals} señales telefónicas en México. Consulta gratuita y sin registro. Las señales son reportes comunitarios de riesgo potencial.`;

  const suggestedPostLong = [
    `Hoy Alerta Número MX monitorea ${totalSignals} señales telefónicas en México.`,
    '',
    'Incluye reportes relacionados con:',
    '• Posible fraude',
    '• Spam',
    '• Cobranza',
    '',
    'Consulta gratuita y sin registro.',
    '',
    'Las señales indican riesgo potencial y sirven como información de referencia, no confirmación legal.',
  ].join('\n');

  const whatsappText = `Alerta Número MX: ${totalSignals} señales telefónicas monitoreadas en México. Revisa números sospechosos con consulta gratuita y sin registro. Reporte comunitario con riesgo potencial, no confirmación legal.`;

  return { suggestedPostShort, suggestedPostLong, whatsappText };
}

function main() {
  const publicStats = readJsonFileSafe(PUBLIC_STATS_PATH);
  const scamNumbers = readJsonFileSafe(SCAM_NUMBERS_PATH);

  if (!publicStats || !Array.isArray(scamNumbers)) {
    console.error('[generate_daily_growth_post] Salida segura: no se generó reporte por falta de datos válidos.');
    process.exit(1);
  }

  const fromStats = Number.isFinite(publicStats.monitoredSignalsCount)
    ? publicStats.monitoredSignalsCount
    : Number.isFinite(publicStats.totalSearchableCount)
      ? publicStats.totalSearchableCount
      : null;

  const totalSignals = Number.isFinite(fromStats) ? fromStats : scamNumbers.length;
  const categoryCounts = countCategories(scamNumbers);
  const posts = buildPosts(totalSignals);

  const output = {
    generatedAt: new Date().toISOString(),
    totalSignals,
    fraudCount: categoryCounts.fraud,
    spamCount: categoryCounts.spam,
    debtCollectionCount: categoryCounts.debt_collection,
    suggestedPostShort: posts.suggestedPostShort,
    suggestedPostLong: posts.suggestedPostLong,
    hashtags: ['#AlertaNumeroMX', '#Mexico', '#FraudeTelefonico', '#Spam', '#Cobranza'],
    whatsappText: posts.whatsappText,
  };

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  console.log(`[generate_daily_growth_post] Reporte generado: ${OUTPUT_PATH}`);
}

main();
