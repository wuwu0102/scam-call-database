const LABELS={suspicious:'Llamada sospechosa',telemarketing:'Publicidad / Telemarketing',collection:'Cobranza'};
const COLLECTION=['cobranza','deuda','debt','collection','despacho','cobrador','recuperacion','recuperación'];
const TELE=['publicidad','telemarketing','marketing','ventas','promo','promocion','promoción','oferta','prestamo','préstamo','credito','crédito','loan'];
function normalizeCategory(input='',snippet=''){const t=`${input} ${snippet}`.toLowerCase();if(COLLECTION.some(k=>t.includes(k)))return'collection';if(TELE.some(k=>t.includes(k)))return'telemarketing';return'suspicious';}
function labelForCategory(c){return LABELS[c]||LABELS.suspicious;}
module.exports={normalizeCategory,labelForCategory,LABELS};
