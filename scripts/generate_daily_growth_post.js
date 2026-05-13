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

function buildPosts(totalSignals) {
  const suggestedPostShort = `Hoy Alerta Número MX monitorea ${totalSignals} señales telefónicas en México. También mostramos principales categorías como fraude, spam y cobranza. Consulta gratuita y sin registro.`;

  const suggestedPostLong = [
    `Hoy Alerta Número MX monitorea ${totalSignals} señales telefónicas en México.`,
    '',
    'Principales categorías detectadas:',
    '• Posible fraude',
    '• Spam',
    '• Cobranza',
    '',
    'Consulta gratuita y sin registro.',
    '',
    'Las señales indican riesgo potencial y sirven como información de referencia, no confirmación legal.',
  ].join('\n');

  const whatsappText = `Alerta Número MX monitorea ${totalSignals} señales telefónicas en México. También muestra principales categorías como fraude, spam y cobranza. Consulta gratuita y sin registro. Riesgo potencial, no confirmación legal.`;

  return { suggestedPostShort, suggestedPostLong, whatsappText };
}

function main() {
  const publicStats = readJsonFileSafe(PUBLIC_STATS_PATH);
  const scamNumbers = readJsonFileSafe(SCAM_NUMBERS_PATH);

  if (!publicStats) {
    console.error('[generate_daily_growth_post] Salida segura: no se generó reporte por falta de public_stats válido.');
    process.exit(1);
  }

  const fromStats = Number.isFinite(publicStats.monitoredSignalsCount)
    ? publicStats.monitoredSignalsCount
    : Number.isFinite(publicStats.totalSearchableCount)
      ? publicStats.totalSearchableCount
      : null;

  const fallbackTotal = Array.isArray(scamNumbers) ? scamNumbers.length : 0;
  const totalSignals = Number.isFinite(fromStats) ? fromStats : fallbackTotal;

  const fraudCount = Number.isFinite(publicStats.fraudCount) ? publicStats.fraudCount : 0;
  const spamCount = Number.isFinite(publicStats.spamCount) ? publicStats.spamCount : 0;
  const debtCollectionCount = Number.isFinite(publicStats.debtCollectionCount) ? publicStats.debtCollectionCount : 0;
  const unknownCount = Number.isFinite(publicStats.unknownCount) ? publicStats.unknownCount : 0;

  const knownCategoryTotal = fraudCount + spamCount + debtCollectionCount + unknownCount;
  if (knownCategoryTotal !== totalSignals) {
    const diff = totalSignals - knownCategoryTotal;
    console.warn(`[generate_daily_growth_post] Advertencia de consistencia: totalSignals=${totalSignals}, categorías conocidas=${knownCategoryTotal}, diferencia=${diff}.`);
  }

  const posts = buildPosts(totalSignals);

  const output = {
    generatedAt: new Date().toISOString(),
    totalSignals,
    fraudCount,
    spamCount,
    debtCollectionCount,
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
