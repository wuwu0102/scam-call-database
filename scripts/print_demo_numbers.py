#!/usr/bin/env python3
"""Print demo phone numbers grouped by frontend categories."""

from __future__ import annotations

import json
import re
from pathlib import Path

SCAM_NUMBERS_PATH = Path(__file__).resolve().parent.parent / "scam_numbers.json"
VALID_MX_NUMBER_PATTERN = re.compile(r"^\+52\d{10}$")
UNKNOWN_FALLBACK = "+525512341234"
MAX_PER_CATEGORY = 5

CATEGORY_MAP = {
    "fraud": "fraud",
    "scam": "fraud",
    "spam": "spam",
    "suspicious": "spam",
    "telemarketing": "spam",
    "debt_collection": "debt_collection",
    "cobranza": "debt_collection",
    "collection": "debt_collection",
}

CATEGORY_TITLES = {
    "fraud": "Fraud / Posible fraude",
    "spam": "Spam / Sospechoso",
    "debt_collection": "Debt collection / Cobranza",
}


def normalize_category(raw_value: object) -> str | None:
    if not isinstance(raw_value, str):
        return None
    return CATEGORY_MAP.get(raw_value.strip().lower())


def is_valid_mx_number(number: object) -> bool:
    return isinstance(number, str) and bool(VALID_MX_NUMBER_PATTERN.match(number))


def pick_unknown_number(existing_numbers: set[str]) -> str:
    if UNKNOWN_FALLBACK not in existing_numbers:
        return UNKNOWN_FALLBACK

    base_prefix = "+52551234"
    for suffix in range(0, 10000):
        candidate = f"{base_prefix}{suffix:04d}"
        if candidate not in existing_numbers:
            return candidate

    raise RuntimeError("No available unknown test number found.")


def main() -> None:
    with SCAM_NUMBERS_PATH.open("r", encoding="utf-8") as f:
        records = json.load(f)

    grouped_numbers: dict[str, list[str]] = {key: [] for key in CATEGORY_TITLES}
    seen_numbers_by_category: dict[str, set[str]] = {key: set() for key in CATEGORY_TITLES}
    all_existing_numbers: set[str] = set()

    for record in records:
        if not isinstance(record, dict):
            continue

        number = record.get("number")
        if not is_valid_mx_number(number):
            continue

        all_existing_numbers.add(number)
        normalized_category = normalize_category(record.get("category"))
        if normalized_category is None:
            normalized_category = normalize_category(record.get("label"))
        if normalized_category not in grouped_numbers:
            continue

        if number in seen_numbers_by_category[normalized_category]:
            continue

        if len(grouped_numbers[normalized_category]) >= MAX_PER_CATEGORY:
            continue

        seen_numbers_by_category[normalized_category].add(number)
        grouped_numbers[normalized_category].append(number)

    for category in ("fraud", "spam", "debt_collection"):
        print(f"{CATEGORY_TITLES[category]}:")
        for number in grouped_numbers[category]:
            print(number)
        print()

    print("Unknown / Desconocido:")
    print(pick_unknown_number(all_existing_numbers))


if __name__ == "__main__":
    main()
