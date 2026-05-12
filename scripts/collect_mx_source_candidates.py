#!/usr/bin/env python3
import argparse
import json
import random
import re
import time
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin, urlparse

from urllib import request, error

ROOT = Path(__file__).resolve().parents[1]
PREVIEW_PATH = ROOT / "data" / "mx_source_candidates_preview.json"
AUDIT_PATH = ROOT / "reports" / "mx_source_candidate_audit.json"
SCAM_DB_PATH = ROOT / "scam_numbers.json"
UA = "ScamCallMX-source-candidate-audit/1.0 (+https://github.com/wuwu0102/scam-call-database)"
MAX_PREVIEW_RECORDS = 500

SOURCE_CONFIGS = [
    {
        "name": "tellows_mx",
        "start_urls": [
            "https://www.tellows.mx/",
            "https://www.tellows.mx/c/newest_comments/",
            "https://www.tellows.mx/c/number-search/",
        ],
        "allowed_domains": {"www.tellows.mx", "tellows.mx"},
    },
    {
        "name": "telefonospam_mx",
        "start_urls": [
            "https://www.telefonospam.com.mx/",
            "https://www.telefonospam.com.mx/top-spam",
        ],
        "allowed_domains": {"www.telefonospam.com.mx", "telefonospam.com.mx"},
    },
    {
        "name": "miraquienhabla_mx",
        "start_urls": [
            "https://www.miraquienhabla.com.mx/",
        ],
        "allowed_domains": {"www.miraquienhabla.com.mx", "miraquienhabla.com.mx"},
    },
]

FRAUD_TERMS = ["fraude", "estafa", "phishing", "extorsión", "extorsion"]
SPAM_TERMS = ["spam", "telemarketing", "publicidad", "molestia", "acoso telefónico", "acoso telefonico", "sms", "sondeo"]
DEBT_TERMS = ["cobranza", "deuda", "empresa de cobranza"]

PHONE_PATTERN = re.compile(r"(?:\+?52\D*)?(?:\d\D*){10,13}")


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def normalize_mx_number(raw: str):
    digits = re.sub(r"\D", "", raw or "")
    if digits.startswith("521") and len(digits) >= 13:
        digits = digits[3:]
    elif digits.startswith("52") and len(digits) >= 12:
        digits = digits[2:]
    if len(digits) > 10:
        digits = digits[-10:]
    if len(digits) != 10:
        return None
    if len(set(digits)) == 1:
        return None
    return f"+52{digits}", digits


def clamp_reason(reason: str) -> str:
    text = re.sub(r"\s+", " ", reason.strip())
    return text[:120]


def categorize(text: str):
    low = (text or "").lower()
    if any(term in low for term in FRAUD_TERMS):
        return "fraud", 0.83, "Señales públicas de fraude/estafa/phishing/extorsión en la página"
    if any(term in low for term in DEBT_TERMS):
        return "debt_collection", 0.76, "Señales públicas de cobranza/deuda en la página"
    if any(term in low for term in SPAM_TERMS):
        return "spam", 0.68, "Señales públicas de spam/telemarketing/publicidad/molestia"
    return "unknown", 0.0, "Sin señal de categoría de riesgo"


def load_current_db_numbers() -> set:
    if not SCAM_DB_PATH.exists():
        return set()
    data = json.loads(SCAM_DB_PATH.read_text(encoding="utf-8"))
    numbers = set()
    if isinstance(data, dict):
        records = data.get("records") or data.get("numbers") or []
    else:
        records = data
    for row in records:
        if not isinstance(row, dict):
            continue
        for key in ("normalizedNumber", "number"):
            v = row.get(key)
            if isinstance(v, str):
                normalized = normalize_mx_number(v)
                if normalized:
                    numbers.add(normalized[0])
    return numbers


def fetch_url(url: str, timeout: int = 15):
    req = request.Request(url, headers={"User-Agent": UA, "Accept-Language": "es-MX,es;q=0.9"})
    try:
        with request.urlopen(req, timeout=timeout) as resp:
            status = getattr(resp, "status", 200)
            body = resp.read().decode("utf-8", errors="ignore")
            return status, body, None
    except error.HTTPError as exc:
        return exc.code, "", str(exc)
    except Exception as exc:
        return None, "", str(exc)


def extract_links(html: str, base_url: str):
    links = []
    for href in re.findall(r"href=[\"']([^\"']+)[\"']", html, flags=re.IGNORECASE):
        links.append(urljoin(base_url, href.strip()))
    return links


def extract_text(html: str):
    text = re.sub(r"<script[\s\S]*?</script>", " ", html, flags=re.IGNORECASE)
    text = re.sub(r"<style[\s\S]*?</style>", " ", text, flags=re.IGNORECASE)
    text = re.sub(r"<[^>]+>", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def scan_source(config: dict, max_pages: int):
    queue = list(config["start_urls"])
    seen_urls = set()
    pages_scanned = 0
    blocked = None
    candidates = []
    skipped_invalid = 0
    skipped_unknown = 0

    while queue and pages_scanned < max_pages:
        url = queue.pop(0)
        if url in seen_urls:
            continue
        seen_urls.add(url)

        try:
            status, html, err = fetch_url(url, timeout=15)
        except Exception as exc:
            blocked = {"source": config["name"], "url": url, "status": "request_error", "detail": str(exc)[:160]}
            break

        if status in (403, 429):
            blocked = {"source": config["name"], "url": url, "status": status, "detail": "blocked_or_rate_limited"}
            break
        if status is None:
            blocked = {"source": config["name"], "url": url, "status": "request_error", "detail": (err or "request_failed")[:160]}
            break
        if status >= 400:
            blocked = {"source": config["name"], "url": url, "status": status, "detail": "http_error"}
            break

        pages_scanned += 1
        text = extract_text(html)
        category, confidence, reason = categorize(text)

        for hit in PHONE_PATTERN.finditer(text):
            normalized = normalize_mx_number(hit.group(0))
            if not normalized:
                skipped_invalid += 1
                continue
            e164, national = normalized
            if category == "unknown":
                skipped_unknown += 1
                continue
            candidates.append(
                {
                    "number": national,
                    "normalizedNumber": e164,
                    "category": category,
                    "sourceName": config["name"],
                    "sourceUrl": url,
                    "confidence": round(confidence, 2),
                    "reason": clamp_reason(reason),
                    "collectedAt": now_iso(),
                }
            )

        for full in extract_links(html, url):
            parsed = urlparse(full)
            if parsed.scheme not in {"http", "https"}:
                continue
            if parsed.netloc not in config["allowed_domains"]:
                continue
            if full not in seen_urls and full not in queue:
                queue.append(full)

        time.sleep(random.uniform(0.8, 1.5))

    return {
        "source": config["name"],
        "pages_scanned": pages_scanned,
        "blocked": blocked,
        "candidates": candidates,
        "skipped_invalid": skipped_invalid,
        "skipped_unknown": skipped_unknown,
    }


def build_recommendation(candidates_by_source: dict, estimated_new: int):
    if not candidates_by_source:
        return {
            "which_source_should_be_promoted_next": "none",
            "risk_level": "medium",
            "expected_db_growth": "0-10",
        }
    best_source = max(candidates_by_source.items(), key=lambda x: x[1])[0]
    if estimated_new >= 250:
        growth = "250+"
    elif estimated_new >= 100:
        growth = "100-249"
    elif estimated_new >= 30:
        growth = "30-99"
    else:
        growth = "0-29"
    risk_level = "low" if estimated_new <= 200 else "medium"
    return {
        "which_source_should_be_promoted_next": best_source,
        "risk_level": risk_level,
        "expected_db_growth": growth,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--preview", action="store_true", help="Write candidate preview + audit only")
    parser.add_argument("--max-pages-per-source", type=int, default=30)
    args = parser.parse_args()

    max_pages = max(1, min(args.max_pages_per_source, 100))

    all_candidates = []
    blocked_or_failed = []
    pages_scanned_by_source = {}
    skipped_invalid = 0
    skipped_unknown = 0

    for source in SOURCE_CONFIGS:
        result = scan_source(source, max_pages)
        pages_scanned_by_source[source["name"]] = result["pages_scanned"]
        all_candidates.extend(result["candidates"])
        skipped_invalid += result["skipped_invalid"]
        skipped_unknown += result["skipped_unknown"]
        if result["blocked"]:
            blocked_or_failed.append(result["blocked"])

    dedup = {}
    for row in all_candidates:
        key = (row["normalizedNumber"], row["category"], row["sourceName"])
        if key not in dedup:
            dedup[key] = row
    unique_candidates = list(dedup.values())

    preview = {
        "generated_at": now_iso(),
        "preview_mode": True,
        "max_pages_per_source": max_pages,
        "candidate_count": len(unique_candidates),
        "records": unique_candidates[:MAX_PREVIEW_RECORDS],
    }

    candidates_by_source = Counter(row["sourceName"] for row in unique_candidates)
    candidates_by_category = Counter(row["category"] for row in unique_candidates)
    current_db_numbers = load_current_db_numbers()
    unique_candidate_numbers = {row["normalizedNumber"] for row in unique_candidates}
    estimated_new = len(unique_candidate_numbers - current_db_numbers)

    audit = {
        "generated_at": now_iso(),
        "sources_scanned": [s["name"] for s in SOURCE_CONFIGS],
        "pages_scanned_by_source": pages_scanned_by_source,
        "candidates_by_source": dict(candidates_by_source),
        "candidates_by_category": dict(candidates_by_category),
        "skipped_invalid": skipped_invalid,
        "skipped_unknown": skipped_unknown,
        "blocked_or_failed_sources": blocked_or_failed,
        "sample_candidates": unique_candidates[:50],
        "estimated_new_unique_candidates_against_current_db": estimated_new,
        "recommendation": build_recommendation(dict(candidates_by_source), estimated_new),
    }

    PREVIEW_PATH.parent.mkdir(parents=True, exist_ok=True)
    AUDIT_PATH.parent.mkdir(parents=True, exist_ok=True)
    PREVIEW_PATH.write_text(json.dumps(preview, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    AUDIT_PATH.write_text(json.dumps(audit, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(json.dumps({"preview_records": len(preview["records"]), "audit_written": True}, ensure_ascii=False))


if __name__ == "__main__":
    main()
