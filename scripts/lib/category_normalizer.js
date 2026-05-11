const LABELS={fraud:'Posible fraude',spam:'Número sospechoso',telemarketing:'Publicidad / ventas',debt_collection:'Cobranza'};
const FRAUD=['fraud','estafa','phishing','extors','suplant','scam'];
const DEBT=['cobranza','deuda','debt','collection','despacho','cobrador','recuperacion','recuperación','credito','crédito','financiera','banco'];
const TELE=['publicidad','telemarketing','marketing','ventas','promo','promocion','promoción','oferta','advertising'];
const SPAM=['spam','molestia','no deseada','suspicious','sospech','whatsapp','sms'];
function normalizeCategory(input='',snippet=''){
  const t=`${input} ${snippet}`.toLowerCase();
  if(FRAUD.some(k=>t.includes(k)))return'fraud';
  if(DEBT.some(k=>t.includes(k)))return'debt_collection';
  if(TELE.some(k=>t.includes(k)))return'telemarketing';
  if(SPAM.some(k=>t.includes(k)))return'spam';
  return'unknown';
}
function labelForCategory(c){return LABELS[c]||'Información de referencia';}
module.exports={normalizeCategory,labelForCategory,LABELS};
