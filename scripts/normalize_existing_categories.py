#!/usr/bin/env python3
import argparse
import json
import tempfile
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCAM = ROOT / "scam_numbers.json"
PREVIEW = ROOT / "scam_numbers.normalized.preview.json"
REPORTS_DIR = ROOT / "reports"
SUMMARY = REPORTS_DIR / "category_normalization_summary.json"

CATEGORY_MAP = {
    "scam": "fraud",
    "fraud": "fraud",
    "suspicious": "spam",
    "spam": "spam",
    "telemarketing": "spam",
    "cobranza": "debt_collection",
    "collection": "debt_collection",
    "debt_collection": "debt_collection",
}

LABEL_MAP = {
    "fraud": "Posible fraude",
    "spam": "Número sospechoso",
    "debt_collection": "Cobranza",
}


def normalize_category(cat):
    return CATEGORY_MAP.get(str(cat or "").strip().lower())


def atomic_write(path: Path, data: str):
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", delete=False, dir=str(path.parent)) as tmp:
        tmp.write(data)
        tmp_path = Path(tmp.name)
    tmp_path.replace(path)


def main(apply=False):
    rows = json.loads(SCAM.read_text(encoding="utf-8"))
    if not isinstance(rows, list):
        raise ValueError("scam_numbers.json must be a list")

    before_counts = Counter()
    after_counts = Counter()
    changed_count = 0
    unknown_count = 0
    legacy_count = 0

    output_rows = []
    for row in rows:
        new_row = dict(row)
        old_cat = str(row.get("category", "")).strip().lower()
        before_counts[old_cat or "(empty)"] += 1

        normalized = normalize_category(old_cat)
        if normalized is None:
            unknown_count += 1
            after_counts[old_cat or "(empty)"] += 1
            output_rows.append(new_row)
            continue

        if old_cat in {"scam", "suspicious", "telemarketing", "cobranza", "collection"}:
            legacy_count += 1

        if row.get("category") != normalized:
            new_row["category"] = normalized
            changed_count += 1

        expected_label = LABEL_MAP[normalized]
        if row.get("label") != expected_label:
            new_row["label"] = expected_label
            changed_count += 1

        after_counts[normalized] += 1
        output_rows.append(new_row)

    preview_payload = json.dumps(output_rows, ensure_ascii=False, indent=2) + "\n"
    summary = {
        "before_counts": dict(sorted(before_counts.items())),
        "after_counts": dict(sorted(after_counts.items())),
        "changed_count": changed_count,
        "unknown_count": unknown_count,
        "legacy_count": legacy_count,
    }

    atomic_write(PREVIEW, preview_payload)
    atomic_write(SUMMARY, json.dumps(summary, ensure_ascii=False, indent=2) + "\n")

    if apply:
        atomic_write(SCAM, preview_payload)
        print(f"Applied normalization to {SCAM}. changed={changed_count} unknown={unknown_count}")
    else:
        print(f"Preview written to {PREVIEW}. changed={changed_count} unknown={unknown_count}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true", help="Write changes to scam_numbers.json")
    args = parser.parse_args()
    main(apply=args.apply)
