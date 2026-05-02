const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) { if (DRY_RUN) { console.log('dry-run without FIREBASE_SERVICE_ACCOUNT_JSON: skipped'); return; } throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is required'); }
  const admin = require('firebase-admin');
  if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(JSON.parse(raw)) });
  const db = admin.firestore();

  const snap = await db.collection('phone_number_reports').where('status','==','pending_auto_review').get();
  const grouped = new Map();
  snap.forEach((d)=>{
    const r = d.data() || {};
    const n = String(r.normalizedNumber||'').replace(/\D/g,'').slice(-10);
    if (!/^\d{10}$/.test(n)) return;
    if (!grouped.has(n)) grouped.set(n, []);
    grouped.get(n).push({id:d.id, ...r});
  });

  let promoted = 0;
  for (const [number, rows] of grouped) {
    const scamLike = rows.filter(r=>['scam','suspicious'].includes(String(r.reportType||'').toLowerCase())).length;
    const safe = rows.filter(r=>String(r.reportType||'').toLowerCase()==='safe').length;
    const ua = new Set(rows.map(r=>String(r.userAgentHash||'')).filter(Boolean)).size;
    const notes = new Set(rows.map(r=>String(r.note||'').trim().toLowerCase()).filter(Boolean)).size;

    if (scamLike >= 5 && safe === 0 && ua >= 3 && notes >= 2) {
      promoted += 1;
      if (!DRY_RUN) {
        await db.collection('phone_numbers').doc(number).set({
          number,
          normalizedNumber: number,
          tag: 'suspicious',
          label: 'Número sospechoso',
          sourceType: 'user_signal_auto_reviewed',
          type: 'user_signal_auto_reviewed',
          reviewStatus: 'auto_reviewed',
          reportCount: scamLike,
          safeReports: safe,
          updatedAt: new Date().toISOString().slice(0,10)
        }, { merge:true });
      }
    }
  }
  console.log(`pending=${snap.size} grouped=${grouped.size} promoted=${promoted} dryRun=${DRY_RUN}`);
}
main().catch((e)=>{ console.error(e.message); process.exit(1); });
