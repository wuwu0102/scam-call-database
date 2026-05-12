#!/usr/bin/env python3
import json
import re
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCAM = ROOT / 'scam_numbers.json'
REPORT = ROOT / 'reports' / 'unmapped_category_audit.json'
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


def tokenize_risk_reason(text):
    if not isinstance(text, str):
        return []
    # Keep ASCII words and CJK chunks with length >= 2.
    ascii_words = re.findall(r"[a-z0-9_']+", text.lower())
    cjk_words = [w for w in re.findall(r'[\u4e00-\u9fff]+', text) if len(w) >= 2]
    return ascii_words + cjk_words


def counter_to_sorted_dict(counter: Counter):
    return {k: v for k, v in sorted(counter.items(), key=lambda item: (-item[1], item[0]))}


def main():
    rows = json.loads(SCAM.read_text(encoding='utf-8'))

    unmapped = []
    category_counts = Counter()
    label_counts = Counter()
    source_counts = Counter()
    risk_keyword_counts = Counter()

    for row in rows:
        old_category = row.get('category') or ''
        new_category = normalize_category(old_category)
        if new_category in ALLOWED:
            continue

        unmapped.append(row)
        category_counts[str(old_category)] += 1
        label_counts[str(row.get('label') or '')] += 1
        source_counts[str(row.get('sourceName') or '')] += 1
        for token in tokenize_risk_reason(row.get('riskReason')):
            risk_keyword_counts[token] += 1

    sample_records = [
        {
            'number': row.get('number'),
            'category': row.get('category'),
            'label': row.get('label'),
            'sourceName': row.get('sourceName'),
            'riskReason': row.get('riskReason'),
        }
        for row in unmapped[:50]
    ]

    report = {
        'total_unmapped': len(unmapped),
        'category_counts': counter_to_sorted_dict(category_counts),
        'label_counts': counter_to_sorted_dict(label_counts),
        'sourceName_counts': counter_to_sorted_dict(source_counts),
        'riskReason_keyword_counts': counter_to_sorted_dict(risk_keyword_counts),
        'sample_records': sample_records,
    }

    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'Wrote report: {REPORT} (total_unmapped={len(unmapped)})')


if __name__ == '__main__':
    main()
