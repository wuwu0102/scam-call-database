const LABELS={fraud:'Posible fraude',spam:'Número sospechoso',debt_collection:'Cobranza'};
const FRAUD=['fraude','fraud','estafa','phishing','suplantación','suplantacion','extorsión','extorsion','scam'];
const DEBT=['cobranza','deuda vencida','adeudo','pago pendiente','atraso','mora','despacho de cobranza','recuperación de cartera','recuperacion de cartera','cobrador'];
const SPAM=['spam','molestia','no deseada','sospechoso','sospechosa','sospechoso','llamadas repetidas','silencio','cuelga','whatsapp','sms','telemarketing','marketing','publicidad','promoción','promocion','oferta','venta','plan','paquete','seguro','tarjeta','préstamo','prestamo','crédito','credito','banco','financiera'];
function normalizeCategory(input='',snippet=''){
  const t=`${input} ${snippet}`.toLowerCase();
  if(FRAUD.some(k=>t.includes(k)))return'fraud';
  if(DEBT.some(k=>t.includes(k)))return'debt_collection';
  if(SPAM.some(k=>t.includes(k)))return'spam';
  return'unknown';
}
function labelForCategory(c){return LABELS[c]||'Información de referencia';}
module.exports={normalizeCategory,labelForCategory,LABELS};
