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


def now(): return datetime.now(timezone.utc).isoformat()

def read_json(p, default):
    if not p.exists(): return default
    return json.loads(p.read_text(encoding='utf-8'))

def atomic(path, tmp, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    tmp.replace(path)

def valid_e164(n): return isinstance(n,str) and n.startswith('+52') and len(n)==13 and n[3:].isdigit()

def merge(dry_run=False):
    before = read_json(SCAM, [])
    cand_payload = read_json(CAND, {'records': []})
    candidates = cand_payload.get('records', []) if isinstance(cand_payload, dict) else []

    by = {r.get('number'): dict(r) for r in before if valid_e164(r.get('number'))}
    source_count = Counter()
    skip_invalid=skip_dup=skip_unknown=added=0

    for c in candidates:
      source_count[c.get('source','unknown')] += 1
      num = c.get('number')
      cat = c.get('category')
      src_url = c.get('source_url')
      if (not valid_e164(num)) or (not src_url): skip_invalid+=1; continue
      if cat == 'unknown': skip_unknown += 1; continue
      if num in by:
          skip_dup += 1
          ex = by[num]
          ex.setdefault('sourceUrl', src_url)
          if ex.get('category') in (None,'unknown') and cat in ('spam','telemarketing','cobranza','scam'):
              ex['category'] = cat
          continue
      if added >= 7000: break
      by[num] = {
        'number': num,
        'label': 'suspicious' if cat != 'scam' else 'scam',
        'country': 'MX',
        'sourceName': 'datostelefonicos',
        'sourceUrl': src_url,
        'confidence': round(float(c.get('confidence', 0.6)), 2),
        'updatedAt': datetime.now(timezone.utc).date().isoformat(),
        'category': cat,
        'riskReason': c.get('reason','')[:140],
      }
      added += 1

    merged = sorted(by.values(), key=lambda x: x['number'])
    if len(merged) < len(before): raise RuntimeError('after_count < before_count')

    if not dry_run:
      atomic(SCAM, TMP_SCAM, merged)
      run(['node','scripts/export_ios_numbers_from_firestore.js'], cwd=ROOT, check=True)
      run(['node','scripts/generate_public_stats.js','--allow-low-count'], cwd=ROOT, check=True)

    summary = {
      'generated_at': now(), 'before_count': len(before), 'candidate_count': len(candidates),
      'added_count': added, 'after_count': len(merged), 'skipped_invalid': skip_invalid,
      'skipped_duplicate': skip_dup, 'skipped_unknown': skip_unknown, 'sources': dict(source_count)
    }
    if not dry_run: atomic(REPORT, TMP_REPORT, summary)
    print(json.dumps(summary, ensure_ascii=False))

if __name__ == '__main__':
    ap=argparse.ArgumentParser(); ap.add_argument('--dry-run', action='store_true'); args=ap.parse_args(); merge(dry_run=args.dry_run)
