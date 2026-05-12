#!/usr/bin/env python3
import argparse
import json
import random
import re
import time
from collections import Counter, defaultdict, deque
from datetime import datetime, timezone
from pathlib import Path
from urllib import error, request
from urllib.parse import urljoin, urlparse

ROOT = Path(__file__).resolve().parents[1]
PREVIEW_PATH = ROOT / "data" / "mx_source_candidates_preview.json"
AUDIT_PATH = ROOT / "reports" / "mx_source_candidate_audit.json"
SCAM_DB_PATH = ROOT / "scam_numbers.json"
UA = "ScamCallMX-source-candidate-audit/1.0 (+https://github.com/wuwu0102/scam-call-database)"
MAX_PREVIEW_RECORDS = 500
PHONE_PATTERN = re.compile(r"(?:\+52|0052)?\D*(\d(?:\D*\d){9,11})")


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def normalize_mx_number(raw: str):
    digits = re.sub(r"\D", "", raw or "")
    if digits.startswith("0052"):
        digits = digits[4:]
    elif digits.startswith("52"):
        digits = digits[2:]
    if len(digits) > 10:
        digits = digits[-10:]
    if len(digits) != 10:
        return None
    if len(set(digits)) == 1:
        return None
    return f"+52{digits}", digits


def clamp_reason(reason: str) -> str:
    return re.sub(r"\s+", " ", (reason or "").strip())[:120]


def load_current_db_numbers() -> set:
    data = json.loads(SCAM_DB_PATH.read_text(encoding="utf-8")) if SCAM_DB_PATH.exists() else []
    records = data.get("records") if isinstance(data, dict) else data
    out = set()
    for row in records or []:
        if not isinstance(row, dict):
            continue
        for key in ("normalizedNumber", "number"):
            value = row.get(key)
            if isinstance(value, str):
                n = normalize_mx_number(value)
                if n:
                    out.add(n[0])
    return out


def fetch_url(url: str, timeout: int = 15):
    req = request.Request(url, headers={"User-Agent": UA, "Accept-Language": "es-MX,es;q=0.9"})
    try:
        with request.urlopen(req, timeout=timeout) as resp:
            return getattr(resp, "status", 200), resp.read().decode("utf-8", errors="ignore"), None
    except error.HTTPError as exc:
        return exc.code, "", str(exc)
    except Exception as exc:
        return None, "", str(exc)


def extract_links(html: str, base_url: str):
    return [urljoin(base_url, href.strip()) for href in re.findall(r"href=[\"']([^\"']+)[\"']", html, flags=re.IGNORECASE)]


def extract_text(html: str):
    text = re.sub(r"<script[\s\S]*?</script>", " ", html, flags=re.IGNORECASE)
    text = re.sub(r"<style[\s\S]*?</style>", " ", text, flags=re.IGNORECASE)
    text = re.sub(r"<[^>]+>", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def map_category(label: str):
    low = (label or "").lower()
    if any(x in low for x in ["extorsión", "extorsion", "fraude", "estafa"]):
        return "fraud"
    if "cobranza" in low:
        return "debt_collection"
    if any(x in low for x in ["spam", "tele ventas", "telemarketing", "ventas", "publicidad agresiva", "publicidad", "desconocido", "molestia"]):
        return "spam"
    return "unknown"


def parse_tellows(url: str, html: str):
    text = extract_text(html)
    m = re.search(r"Tipos? de llamada\s*:\s*([^\|\n\r<]+)", text, flags=re.IGNORECASE)
    tipo = (m.group(1).strip() if m else "")
    category = map_category(tipo)
    if category == "unknown":
        return []
    confidence = 0.8 if re.search(r"no fiable|estafa", text, flags=re.IGNORECASE) else 0.65
    reason = clamp_reason("Tellows reporta este número como Estafa" if "estafa" in tipo.lower() else f"Tellows reporta tipo de llamada: {tipo}")
    items = []
    for hit in PHONE_PATTERN.findall(text):
        norm = normalize_mx_number(hit)
        if norm:
            items.append({
                "number": norm[1],
                "normalizedNumber": norm[0],
                "category": category,
                "sourceName": "Tellows MX",
                "sourceUrl": url,
                "confidence": confidence,
                "reason": reason,
                "collectedAt": now_iso(),
            })
    return items


def parse_mira(url: str, html: str):
    text = extract_text(html)
    items = []
    for match in re.finditer(r"(\+?52?[\d\s\-\(\)]{10,16}).{0,120}?(Tipo de llamada\s*:?\s*[^\|\n\r]+)", text, flags=re.IGNORECASE):
        norm = normalize_mx_number(match.group(1))
        if not norm:
            continue
        tipo = match.group(2)
        category = map_category(tipo)
        if category == "unknown":
            continue
        items.append({
            "number": norm[1], "normalizedNumber": norm[0], "category": category,
            "sourceName": "MiraQuienHabla MX", "sourceUrl": url, "confidence": 0.65,
            "reason": clamp_reason(f"MiraQuienHabla indica {tipo}"), "collectedAt": now_iso(),
        })
    return items


def parse_telefonospam(url: str, html: str):
    text = extract_text(html)
    low = text.lower()
    if "top spam" not in low and "últimos buscados" not in low and "ultimos buscados" not in low:
        return []
    category = map_category(text)
    if category == "unknown":
        return []
    items = []
    for hit in PHONE_PATTERN.findall(text):
        norm = normalize_mx_number(hit)
        if norm:
            items.append({
                "number": norm[1], "normalizedNumber": norm[0], "category": category,
                "sourceName": "TelefonoSpam MX", "sourceUrl": url, "confidence": 0.65,
                "reason": clamp_reason("TelefonoSpam muestra este número en listados públicos"), "collectedAt": now_iso(),
            })
    return items


def is_detail_like(url: str):
    p = urlparse(url).path.lower()
    return "/num/" in p or "/numero/" in p or "/phone/" in p or "/telefono/" in p or p == "/"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--preview", action="store_true")
    parser.add_argument("--seed-urls", required=True)
    parser.add_argument("--max-pages-per-source", type=int, default=30)
    args = parser.parse_args()

    seed_urls = json.loads((ROOT / args.seed_urls).read_text(encoding="utf-8"))
    max_pages = max(1, min(args.max_pages_per_source, 30))

    existing = load_current_db_numbers()
    queue = deque(seed_urls)
    seen = set()
    pages_scanned = defaultdict(int)
    blocked = []
    all_candidates = []
    skipped_invalid = 0
    skipped_unknown = 0

    while queue and sum(pages_scanned.values()) < max_pages:
        url = queue.popleft()
        if url in seen:
            continue
        seen.add(url)
        host = urlparse(url).netloc.lower()
        source_key = "tellows.mx" if "tellows.mx" in host else "miraquienhabla.com.mx" if "miraquienhabla" in host else "telefonospam.com.mx" if "telefonospam" in host else host
        if pages_scanned[source_key] >= max_pages:
            continue

        status, html, err = fetch_url(url, timeout=15)
        if status in (403, 429):
            blocked.append({"source": source_key, "url": url, "status": status, "detail": "blocked"})
            continue
        if status is None or status >= 400:
            blocked.append({"source": source_key, "url": url, "status": status or "request_error", "detail": (err or "http_error")[:160]})
            continue

        pages_scanned[source_key] += 1

        parsed_rows = []
        if "tellows.mx" in host:
            parsed_rows = parse_tellows(url, html)
        elif "miraquienhabla" in host:
            parsed_rows = parse_mira(url, html)
        elif "telefonospam" in host:
            parsed_rows = parse_telefonospam(url, html)

        for row in parsed_rows:
            if row["normalizedNumber"] in existing:
                continue
            if row["category"] == "unknown":
                skipped_unknown += 1
                continue
            all_candidates.append(row)

        for next_url in extract_links(html, url):
            pu = urlparse(next_url)
            if pu.scheme not in {"http", "https"}:
                continue
            if pu.netloc != host:
                continue
            if not is_detail_like(next_url):
                continue
            if next_url not in seen:
                queue.append(next_url)

        time.sleep(random.uniform(0.8, 1.5))

    dedup = {}
    for row in all_candidates:
        key = (row["normalizedNumber"], row["category"], row["sourceName"])
        dedup[key] = row
    unique_candidates = list(dedup.values())

    audit = {
        "generated_at": now_iso(),
        "pages_scanned_by_source": dict(pages_scanned),
        "blocked_or_failed_sources": blocked,
        "candidates_by_source": dict(Counter(x["sourceName"] for x in unique_candidates)),
        "candidates_by_category": dict(Counter(x["category"] for x in unique_candidates)),
        "estimated_new_unique_candidates_against_current_db": len({x["normalizedNumber"] for x in unique_candidates}),
        "skipped_unknown": skipped_unknown,
        "skipped_invalid": skipped_invalid,
        "sample_candidates": unique_candidates[:50],
        "recommendation": "Use seeded detail pages; keep preview-only until manual review.",
    }

    preview = {
        "generated_at": now_iso(),
        "preview_mode": bool(args.preview),
        "max_pages_per_source": max_pages,
        "candidate_count": len(unique_candidates),
        "records": unique_candidates[:MAX_PREVIEW_RECORDS],
    }

    PREVIEW_PATH.write_text(json.dumps(preview, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    AUDIT_PATH.write_text(json.dumps(audit, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"preview_records": len(preview["records"]), "audit_written": True}, ensure_ascii=False))


if __name__ == "__main__":
    main()
