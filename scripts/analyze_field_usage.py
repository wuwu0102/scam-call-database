#!/usr/bin/env python3
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DB_PATH = ROOT / 'scam_numbers.json'
OUT_PATH = ROOT / 'reports' / 'field_usage_optimization_report.json'

WEBSITE_REQUIRED = {
    'number': '查詢比對主鍵；前端 normalize 後以 number/phone 匹配。',
    'category': '前端結果顏色與文案分類依賴 category。',
    'label': '前端顯示友善標籤（回退可用）。',
    'sourceName': '結果區塊顯示來源名稱。',
    'sourceType': '前端會映射來源型態文字。'
}

IOS_REQUIRED = {
    'number': 'iOS 匯出必需的號碼來源欄位。',
    'label': 'iOS 匯出預設標籤來源。',
    'updatedAt': 'iOS 匯出/驗證常見日期欄位。'
}

REPORT_ONLY = {
    'riskReason': '內容長且偏敘述，可移至報告層或次要索引。',
    'note': '偏自由文字，主要用於說明，不是查詢主鍵。',
    'lastUpdated': '與 updatedAt 語意重疊，可合併。',
    'sourceUrl': '可移至來源目錄以 ID 取代，減少重複 URL。',
    'country': '全庫皆為 MX，常數欄位可下沉為全域設定。'
}

with DB_PATH.open(encoding='utf-8') as f:
    rows = json.load(f)

n = len(rows)
fields = sorted({k for r in rows for k in r.keys()})
stats = {}

for field in fields:
    present = 0
    empty = 0
    total_str_len = 0
    non_empty_str = 0
    bytes_est = 0
    for r in rows:
        if field not in r:
            continue
        present += 1
        v = r[field]
        s = '' if v is None else str(v)
        if s.strip() == '':
            empty += 1
        else:
            non_empty_str += 1
            total_str_len += len(s)
        # 粗估 JSON bytes: "field":"value", （含 key/value 引號與冒號逗號）
        bytes_est += len(json.dumps(field, ensure_ascii=False)) + 1 + len(json.dumps(v, ensure_ascii=False)) + 1

    stats[field] = {
        'present_count': present,
        'present_ratio': round(present / n, 6),
        'empty_ratio_within_present': round((empty / present) if present else 0, 6),
        'avg_string_length_non_empty': round((total_str_len / non_empty_str) if non_empty_str else 0, 3),
        'estimated_json_bytes': bytes_est,
        'estimated_json_mb': round(bytes_est / (1024 * 1024), 3),
    }

current_size = DB_PATH.stat().st_size
potential_savings = {
    'drop_country': stats.get('country', {}).get('estimated_json_bytes', 0),
    'drop_lastUpdated_keep_updatedAt': stats.get('lastUpdated', {}).get('estimated_json_bytes', 0),
    'drop_note': stats.get('note', {}).get('estimated_json_bytes', 0),
    'drop_riskReason': stats.get('riskReason', {}).get('estimated_json_bytes', 0),
    'replace_sourceUrl_with_sourceId_6chars': max(
        0,
        stats.get('sourceUrl', {}).get('estimated_json_bytes', 0)
        - int(stats.get('sourceUrl', {}).get('present_count', 0) * (len('"sourceId":') + len('"abc123"') + 1))
    ),
}

report = {
    'generated_at_utc': __import__('datetime').datetime.now(__import__('datetime').timezone.utc).isoformat(),
    'input_file': 'scam_numbers.json',
    'row_count': n,
    'current_file_bytes': current_size,
    'current_file_mb': round(current_size / (1024 * 1024), 3),
    'field_stats': stats,
    'website_required_fields': WEBSITE_REQUIRED,
    'ios_export_required_fields': IOS_REQUIRED,
    'report_layer_candidate_fields': REPORT_ONLY,
    'estimated_savings_bytes': potential_savings,
}
report['estimated_savings_total_bytes'] = sum(potential_savings.values())
report['estimated_savings_total_mb'] = round(report['estimated_savings_total_bytes'] / (1024 * 1024), 3)
report['estimated_savings_percent_of_file'] = round((report['estimated_savings_total_bytes'] / current_size) * 100, 2) if current_size else 0

OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
OUT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(f'Wrote {OUT_PATH}')
