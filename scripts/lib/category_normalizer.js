const LABELS={suspicious:'Llamada sospechosa',telemarketing:'Publicidad / Telemarketing',collection:'Cobranza'};
const COLLECTION=['cobranza','deuda','debt','collection','despacho','cobrador','recuperacion','recuperación'];
const TELE=['publicidad','telemarketing','marketing','ventas','promo','promocion','promoción','oferta','advertising'];
const SUSP=['scam','fraud','spam','phishing','unknown','suspicious'];
function normalizeCategory(input='',snippet=''){
  const t=`${input} ${snippet}`.toLowerCase();
  if(COLLECTION.some(k=>t.includes(k)))return'collection';
  if(TELE.some(k=>t.includes(k)))return'telemarketing';
  if(SUSP.some(k=>t.includes(k)))return'suspicious';
  return'suspicious';
}
function labelForCategory(c){return LABELS[c]||LABELS.suspicious;}
module.exports={normalizeCategory,labelForCategory,LABELS};
