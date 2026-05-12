#!/usr/bin/env python3
import json
from collections import Counter, defaultdict
from pathlib import Path

INPUT = Path('scam_numbers.json')
OUTPUT = Path('reports/db_optimization_report.json')


def main() -> None:
    records = json.loads(INPUT.read_text(encoding='utf-8'))
    total = len(records)

    by_number = defaultdict(list)
    by_source = defaultdict(list)
    for r in records:
        n = r.get('number')
        by_number[n].append(r)
        by_source[r.get('sourceName', 'unknown')].append(r)

    duplicate_numbers = {n: rows for n, rows in by_number.items() if len(rows) > 1}
    duplicate_number_count = len(duplicate_numbers)

    same_number_diff_source = 0
    same_number_diff_category = 0
    same_number_repeated_write = 0

    merge_candidate_records = 0
    for rows in duplicate_numbers.values():
        sources = {x.get('sourceName') for x in rows}
        categories = {x.get('category') for x in rows}
        if len(sources) > 1:
            same_number_diff_source += 1
        if len(categories) > 1:
            same_number_diff_category += 1

        combos = Counter((x.get('sourceName'), x.get('category')) for x in rows)
        if any(c > 1 for c in combos.values()):
            same_number_repeated_write += 1
        merge_candidate_records += max(0, len(rows) - 1)

    top_sources = []
    for s, rows in by_source.items():
        nums = [x.get('number') for x in rows]
        unique_nums = len(set(nums))
        dup_rows = len(rows) - unique_nums
        top_sources.append({
            'source': s,
            'records': len(rows),
            'unique_numbers': unique_nums,
            'duplicate_rows': dup_rows,
            'duplicate_rate': round((dup_rows / len(rows)) if rows else 0.0, 6),
        })

    largest_sources_top20 = sorted(top_sources, key=lambda x: x['records'], reverse=True)[:20]
    highest_dup_sources_top20 = sorted(
        [x for x in top_sources if x['records'] >= 10],
        key=lambda x: (x['duplicate_rate'], x['duplicate_rows']),
        reverse=True,
    )[:20]

    category_counter = Counter(r.get('category') for r in records)
    sparse_fields = {}
    all_keys = sorted({k for r in records for k in r.keys()})
    for k in all_keys:
        present = sum(1 for r in records if r.get(k) not in (None, '', [], {}))
        sparse_fields[k] = {
            'present': present,
            'present_ratio': round(present / total, 6) if total else 0.0,
        }

    safe_dedupe_remaining = total - merge_candidate_records
    safe_dedupe_ratio = round(merge_candidate_records / total, 6) if total else 0.0

    poor_quality_sources = [
        x for x in sorted(top_sources, key=lambda t: (t['duplicate_rate'], t['records']), reverse=True)
        if x['records'] >= 50 and x['duplicate_rate'] >= 0.15
    ]

    report = {
        'input_file': str(INPUT),
        'generated_file': str(OUTPUT),
        'totals': {
            'records': total,
            'unique_numbers': len(by_number),
            'duplicate_number_count': duplicate_number_count,
            'duplicate_record_count': total - len(by_number),
        },
        'duplication_stats': {
            'same_number_different_sources': same_number_diff_source,
            'same_number_different_categories': same_number_diff_category,
            'same_number_repeated_write': same_number_repeated_write,
        },
        'top20_largest_sources': largest_sources_top20,
        'top20_highest_duplicate_rate_sources': highest_dup_sources_top20,
        'analysis': {
            'merge_opportunities': {
                'duplicate_number_groups': duplicate_number_count,
                'merge_candidate_records': merge_candidate_records,
                'suggestion': '針對同號碼保留一筆主記錄，並將來源與分類改為聚合欄位（sources/categories）。'
            },
            'low_quality_sources': poor_quality_sources,
            'low_utility_fields': {
                k: v for k, v in sparse_fields.items() if v['present_ratio'] < 0.2
            },
            'top_categories': category_counter.most_common(20),
        },
        'optimization_estimate': {
            'safe_slimming_ratio': safe_dedupe_ratio,
            'estimated_remaining_records_after_dedupe': safe_dedupe_remaining,
            'assumption': '僅移除同號碼重複列，不刪除唯一號碼。'
        },
        'methodology': {
            'different_sources_definition': '同一 number 對應超過 1 個 sourceName。',
            'different_categories_definition': '同一 number 對應超過 1 個 category。',
            'repeated_write_definition': '同一 number 在相同 (sourceName, category) 組合下重複出現。',
            'duplicate_rate_definition': '每個來源內 duplicate_rows / records。'
        }
    }

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'Wrote {OUTPUT}')


if __name__ == '__main__':
    main()
