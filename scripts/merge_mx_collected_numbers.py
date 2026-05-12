#!/usr/bin/env python3
import argparse, json
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from subprocess import run

ROOT = Path(__file__).resolve().parents[1]
SCAM = ROOT / 'scam_numbers.json'
CAND = ROOT / 'data' / 'mx_datostelefonicos_candidates.json'
REPORT = ROOT / 'reports' / 'mx_collection_summary.json'
TMP_SCAM = SCAM.with_suffix('.json.tmp')
TMP_REPORT = REPORT.with_suffix('.json.tmp')

LABELS = {
    'fraud': 'Posible fraude',
    'spam': 'Número sospechoso',
    'debt_collection': 'Cobranza',
}
ALLOWED_CATEGORIES = set(LABELS.keys())


def now(): return datetime.now(timezone.utc).isoformat()

def read_json(p, default):
    if not p.exists(): return default
    return json.loads(p.read_text(encoding='utf-8'))

def atomic(path, tmp, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    tmp.replace(path)

def valid_e164(n): return isinstance(n, str) and n.startswith('+52') and len(n) == 13 and n[3:].isdigit()

def normalize_category(cat):
    t = (cat or '').strip().lower()
    if t in ALLOWED_CATEGORIES:
        return t
    if t in ('scam', 'estafa', 'phishing', 'suplantacion', 'suplantación', 'extorsion', 'extorsión'):
        return 'fraud'
    if t in ('suspicious', 'molestia', 'no_deseada', 'whatsapp', 'sms', 'telemarketing', 'marketing', 'publicidad', 'venta', 'promocion', 'promoción'):
        return 'spam'
    if t in ('collection', 'debt', 'deuda', 'adeudo', 'mora', 'atraso', 'cobrador', 'cobranza'):
        return 'debt_collection'
    return 'unknown'

def merge(dry_run=False, target_total=50000, max_add_per_run=3000):
    before = read_json(SCAM, [])
    cand_payload = read_json(CAND, {'records': []})
    candidates = cand_payload.get('records', []) if isinstance(cand_payload, dict) else []

    if len(before) >= target_total:
        summary = {
            'generated_at': now(), 'before_count': len(before), 'candidate_count': len(candidates),
            'added_count': 0, 'after_count': len(before), 'skipped_invalid': 0,
            'skipped_duplicate': 0, 'skipped_unknown': 0, 'sources': {},
            'status': 'target_reached', 'target_total': target_total, 'max_add_per_run': max_add_per_run,
        }
        if not dry_run:
            atomic(REPORT, TMP_REPORT, summary)
        print(json.dumps(summary, ensure_ascii=False))
        return

    by = {r.get('number'): dict(r) for r in before if valid_e164(r.get('number'))}
    source_count = Counter()
    skip_invalid = skip_dup = skip_unknown = added = 0

    for c in candidates:
        source_count[c.get('source', 'unknown')] += 1
        num = c.get('number')
        cat = normalize_category(c.get('category'))
        src_url = c.get('source_url')
        if (not valid_e164(num)) or (not src_url):
            skip_invalid += 1
            continue
        if cat not in ALLOWED_CATEGORIES:
            skip_unknown += 1
            continue
        if num in by:
            skip_dup += 1
            ex = by[num]
            ex.setdefault('sourceUrl', src_url)
            ex.setdefault('sourceName', 'datostelefonicos')
            ex.setdefault('confidence', round(float(c.get('confidence', 0.6)), 2))
            ex.setdefault('updatedAt', datetime.now(timezone.utc).date().isoformat())
            old_cat = normalize_category(ex.get('category', ''))
            if old_cat == 'unknown':
                ex['category'] = cat
                ex['label'] = LABELS[cat]
            continue
        if added >= max_add_per_run or len(by) >= target_total:
            break
        by[num] = {
            'number': num,
            'label': LABELS[cat],
            'country': 'MX',
            'sourceName': 'datostelefonicos',
            'sourceUrl': src_url,
            'confidence': round(float(c.get('confidence', 0.6)), 2),
            'updatedAt': datetime.now(timezone.utc).date().isoformat(),
            'category': cat,
            'riskReason': c.get('reason', '')[:140],
        }
        added += 1

    merged = sorted(by.values(), key=lambda x: x['number'])
    if len(merged) < len(before):
        raise RuntimeError('after_count < before_count')

    if not dry_run and added > 0:
        atomic(SCAM, TMP_SCAM, merged)
        run(['node', 'scripts/export_ios_numbers_from_firestore.js'], cwd=ROOT, check=True)
        run(['node', 'scripts/generate_public_stats.js', '--allow-low-count'], cwd=ROOT, check=True)

    summary = {
        'generated_at': now(), 'before_count': len(before), 'candidate_count': len(candidates),
        'added_count': added, 'after_count': len(merged), 'skipped_invalid': skip_invalid,
        'skipped_duplicate': skip_dup, 'skipped_unknown': skip_unknown, 'sources': dict(source_count),
        'target_total': target_total, 'max_add_per_run': max_add_per_run,
        'status': 'no_new_records' if added == 0 else 'added_records',
    }
    if not dry_run:
        atomic(REPORT, TMP_REPORT, summary)
    print(json.dumps(summary, ensure_ascii=False))

if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--target-total', type=int, default=50000)
    ap.add_argument('--max-add-per-run', type=int, default=3000)
    args = ap.parse_args()
    merge(dry_run=args.dry_run, target_total=max(1, args.target_total), max_add_per_run=max(1, args.max_add_per_run))
