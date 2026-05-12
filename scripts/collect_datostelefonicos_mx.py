#!/usr/bin/env python3
import argparse, json, random, re, time
from collections import deque
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'data' / 'mx_datostelefonicos_candidates.json'
TMP = OUT.with_suffix('.json.tmp')
BASE = 'https://datostelefonicos.com'
UA = 'ScamCallMX-research-bot/1.0 (+https://github.com/wuwu0102/scam-call-database)'
MAX_PAGES = 2500

KW_FRAUD = ['fraude', 'fraud', 'estafa', 'phishing', 'suplantación', 'suplantacion', 'extorsión', 'extorsion', 'scam']
KW_DEBT = ['cobranza', 'deuda vencida', 'adeudo', 'pago pendiente', 'atraso', 'mora', 'despacho de cobranza', 'recuperación de cartera', 'recuperacion de cartera', 'cobrador']
KW_SPAM = ['spam', 'molestia', 'no deseada', 'sospechoso', 'llamadas repetidas', 'silencio', 'cuelga', 'whatsapp', 'sms', 'telemarketing', 'marketing', 'publicidad', 'promoción', 'promocion', 'oferta', 'venta', 'plan', 'paquete', 'seguro', 'tarjeta', 'préstamo', 'prestamo', 'crédito', 'credito', 'banco', 'financiera']

PHONE_PAT = re.compile(r'(?:\+?52\D*)?(\d\D*){10,12}')
INFO_LINK_PAT = re.compile(r'^/info/\d+')


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def normalize_mx(raw: str):
    d = re.sub(r'\D', '', raw or '')
    if d.startswith('521') and len(d) >= 13:
        d = d[3:]
    elif d.startswith('52') and len(d) >= 12:
        d = d[2:]
    if len(d) > 10:
        d = d[-10:]
    if len(d) != 10:
        return None
    if d in {'0000000000', '1111111111', '1234567890'}:
        return None
    if len(set(d)) == 1:
        return None
    return f'+52{d}', d


def categorize(text: str):
    t = (text or '').lower()
    if any(k in t for k in KW_FRAUD):
        return 'fraud', 0.82, 'keywords:fraud/estafa/phishing/extorsión/suplantación'
    if any(k in t for k in KW_DEBT):
        return 'debt_collection', 0.75, 'keywords:cobranza/deuda vencida/adeudo/mora'
    if any(k in t for k in KW_SPAM):
        return 'spam', 0.65, 'keywords:spam/sospechoso/publicidad/telemarketing'
    return 'unknown', 0.55, 'sin keywords de riesgo claras'


def safe_write(path: Path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    TMP.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    TMP.replace(path)


def collect(dry_run=False, max_pages=MAX_PAGES, max_runtime_sec=1200, stall_pages=300, timeout=15):
    s = requests.Session()
    s.headers.update({'User-Agent': UA, 'Accept-Language': 'es-MX,es;q=0.9'})
    q = deque([BASE + '/'])
    seen_pages, seen_numbers, out = set(), set(), []
    started = time.time()
    pages_without_new = 0

    while q and len(seen_pages) < max_pages:
        if (time.time() - started) >= max_runtime_sec:
            print('stop: max runtime reached')
            break

        url = q.popleft()
        if url in seen_pages:
            continue
        seen_pages.add(url)

        try:
            r = s.get(url, timeout=timeout)
            if r.status_code in (403, 429):
                continue
            if r.status_code != 200:
                continue
            html = r.text
        except Exception:
            continue

        soup = BeautifulSoup(html, 'html.parser')
        text = soup.get_text(' ', strip=True)
        cat, conf, reason = categorize(text)
        before_len = len(out)

        for m in PHONE_PAT.finditer(text):
            n = normalize_mx(m.group(0))
            if not n:
                continue
            e164, national = n
            key = (e164, url)
            if key in seen_numbers:
                continue
            seen_numbers.add(key)
            out.append({
                'number': e164,
                'national': national,
                'country': 'MX',
                'category': cat,
                'source': 'datostelefonicos',
                'source_url': url,
                'confidence': conf,
                'reason': reason,
                'collected_at': now_iso()
            })

        pages_without_new = pages_without_new + 1 if len(out) == before_len else 0
        if pages_without_new >= stall_pages:
            print('stop: too many pages without new numbers')
            break

        for a in soup.select('a[href]'):
            href = a.get('href', '')
            full = urljoin(BASE, href)
            p = urlparse(full)
            if p.netloc != urlparse(BASE).netloc:
                continue
            if INFO_LINK_PAT.search(p.path) or any(x in (a.get_text(' ', strip=True).lower()) for x in ['números más buscados', 'ultimos números reportados en méxico', 'más vistos en mx', 'mas vistos en mx']):
                if full not in seen_pages and full not in q and len(q) < max_pages * 2:
                    q.append(full)

        if len(seen_pages) % 100 == 0:
            elapsed = round(time.time() - started, 1)
            print(f'progress pages={len(seen_pages)} candidates={len(out)} queue={len(q)} elapsed_sec={elapsed}')

        time.sleep(random.uniform(0.8, 1.5))

    payload = {'generated_at': now_iso(), 'dry_run': dry_run, 'pages_visited': len(seen_pages), 'candidate_count': len(out), 'records': out}
    if not dry_run:
        safe_write(OUT, payload)
    print(json.dumps({k: v for k, v in payload.items() if k != 'records'}, ensure_ascii=False))


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--max-pages', type=int, default=MAX_PAGES)
    ap.add_argument('--max-runtime-sec', type=int, default=1200)
    ap.add_argument('--stall-pages', type=int, default=300)
    ap.add_argument('--timeout', type=int, default=15)
    args = ap.parse_args()
    collect(
        dry_run=args.dry_run,
        max_pages=min(args.max_pages, MAX_PAGES),
        max_runtime_sec=max(60, args.max_runtime_sec),
        stall_pages=max(50, args.stall_pages),
        timeout=max(5, args.timeout),
    )
