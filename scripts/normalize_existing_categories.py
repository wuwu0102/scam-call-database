#!/usr/bin/env python3
import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCAM = ROOT / 'scam_numbers.json'
OUT = ROOT / 'scam_numbers.normalized.preview.json'


def normalize_category(cat):
    t = (cat or '').strip().lower()
    if t == 'debt_collection':
        return 'debt_collection'
    if t in {'fraud', 'scam'}:
        return 'fraud'
    if t in {'spam', 'telemarketing', 'suspicious', 'cobranza', 'collection'}:
        return 'spam'
    return t


def main(apply=False):
    rows = json.loads(SCAM.read_text(encoding='utf-8'))
    changed = 0
    for row in rows:
        old = row.get('category', '')
        new = normalize_category(old)
        if new != old:
            row['category'] = new
            changed += 1
    if apply:
        SCAM.write_text(json.dumps(rows, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        print(f'Applied normalization. changed={changed}')
    else:
        OUT.write_text(json.dumps(rows, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        print(f'Preview written to {OUT}. changed={changed}')


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--apply', action='store_true', help='Write changes to scam_numbers.json')
    args = ap.parse_args()
    main(apply=args.apply)
