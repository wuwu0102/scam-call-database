#!/usr/bin/env python3
import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCAM = ROOT / 'scam_numbers.json'
OUT = ROOT / 'scam_numbers.normalized.preview.json'
SUMMARY = ROOT / 'reports' / 'category_normalization_summary.json'
TMP_SCAM = SCAM.with_suffix('.json.tmp')

ALLOWED = {'fraud', 'spam', 'debt_collection'}


def normalize_category(cat):
    t = (cat or '').strip().lower()
    if t == 'debt_collection':
        return 'debt_collection'
    if t in {'fraud', 'scam'}:
        return 'fraud'
    if t in {'spam', 'telemarketing', 'suspicious'}:
        return 'spam'
    if t in {'cobranza', 'collection'}:
        return 'debt_collection'
    return t


def valid_e164(n):
    return isinstance(n, str) and n.startswith('+52') and len(n) == 13 and n[3:].isdigit()


def atomic_write_json(path: Path, tmp_path: Path, payload):
    tmp_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    tmp_path.replace(path)


def main(apply=False):
    rows = json.loads(SCAM.read_text(encoding='utf-8'))
    before_count = len(rows)
    changed = 0
    unmapped = []
    normalized = []

    for row in rows:
        old = (row.get('category') or '')
        new = normalize_category(old)
        if new not in ALLOWED:
            unmapped.append({'number': row.get('number'), 'category': old})
        row_copy = dict(row)
        if new != old:
            row_copy['category'] = new
            changed += 1
        normalized.append(row_copy)

    if len(normalized) < before_count:
        raise SystemExit(f'abort: total rows decreased before={before_count} after={len(normalized)}')

    summary = {
        'before_count': before_count,
        'after_count': len(normalized),
        'changed_count': changed,
        'unmapped_count': len(unmapped),
        'unmapped_preview': unmapped[:20],
        'apply_requested': bool(apply),
    }
    SUMMARY.parent.mkdir(parents=True, exist_ok=True)
    SUMMARY.write_text(json.dumps(summary, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

    if unmapped:
        raise SystemExit(f"abort: unmapped/unknown categories found: {len(unmapped)}")

    if apply:
        try:
            atomic_write_json(SCAM, TMP_SCAM, normalized)
            # Verify parse after atomic replace
            json.loads(SCAM.read_text(encoding='utf-8'))
        except Exception as exc:
            raise SystemExit(f'abort: JSON write/parse validation failed: {exc}')
        print(f'Applied normalization atomically. changed={changed}')
    else:
        OUT.write_text(json.dumps(normalized, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        print(f'Preview written to {OUT}. changed={changed}')


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--apply', action='store_true', help='Write changes to scam_numbers.json')
    args = ap.parse_args()
    main(apply=args.apply)
