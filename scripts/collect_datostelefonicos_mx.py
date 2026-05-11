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
MAX_PAGES = 8000

KW_SCAM = ['spam','molestia','no deseada','sospechoso','fraud','estafa','extorsión','extorsion']
KW_TELE = ['telemarketing','venta','publicidad','promoción','promocion']
KW_COBR = ['cobranza','deuda','banco','financiera','crédito','credito']

PHONE_PAT = re.compile(r'(?:\+?52\D*)?(\d\D*){10,12}')
INFO_LINK_PAT = re.compile(r'^/info/\d+')


def now_iso():
    return datetime.now(timezone.utc).isoformat()

def normalize_mx(raw: str):
    d = re.sub(r'\D', '', raw or '')
    if d.startswith('521') and len(d) >= 13: d = d[3:]
    elif d.startswith('52') and len(d) >= 12: d = d[2:]
    if len(d) > 10: d = d[-10:]
    if len(d) != 10: return None
    if d in {'0000000000','1111111111','1234567890'}: return None
    if len(set(d)) == 1: return None
    return f'+52{d}', d

def categorize(text: str):
    t = (text or '').lower()
    if any(k in t for k in KW_COBR): return 'cobranza', 0.75, 'keywords:cobranza/deuda/banco'
    if any(k in t for k in KW_TELE): return 'telemarketing', 0.65, 'keywords:telemarketing/venta/publicidad'
    if any(k in t for k in KW_SCAM): return 'scam', 0.82, 'keywords:spam/sospechoso/fraude/estafa/extorsión'
    return 'unknown', 0.55, 'sin keywords de riesgo claras'

def safe_write(path: Path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    TMP.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    TMP.replace(path)

def collect(dry_run=False, max_pages=MAX_PAGES):
    s = requests.Session(); s.headers.update({'User-Agent': UA, 'Accept-Language':'es-MX,es;q=0.9'})
    q = deque([BASE + '/'])
    seen_pages, seen_numbers, out = set(), set(), []

    while q and len(seen_pages) < max_pages:
        url = q.popleft()
        if url in seen_pages: continue
        seen_pages.add(url)
        try:
            r = s.get(url, timeout=15)
            if r.status_code != 200: continue
            html = r.text
        except Exception:
            continue
        soup = BeautifulSoup(html, 'html.parser')
        text = soup.get_text(' ', strip=True)
        cat, conf, reason = categorize(text)

        for m in PHONE_PAT.finditer(text):
            n = normalize_mx(m.group(0))
            if not n: continue
            e164, national = n
            key = (e164, url)
            if key in seen_numbers: continue
            seen_numbers.add(key)
            out.append({
                'number': e164, 'national': national, 'country': 'MX', 'category': cat,
                'source': 'datostelefonicos', 'source_url': url, 'confidence': conf,
                'reason': reason, 'collected_at': now_iso()
            })

        for a in soup.select('a[href]'):
            href = a.get('href','')
            full = urljoin(BASE, href)
            p = urlparse(full)
            if p.netloc != urlparse(BASE).netloc: continue
            if INFO_LINK_PAT.search(p.path) or any(x in (a.get_text(' ', strip=True).lower()) for x in ['números más buscados','ultimos números reportados en méxico','más vistos en mx','mas vistos en mx']):
                if full not in seen_pages: q.append(full)

        time.sleep(random.uniform(0.8, 1.5))

    payload = {'generated_at': now_iso(), 'dry_run': dry_run, 'pages_visited': len(seen_pages), 'candidate_count': len(out), 'records': out}
    if not dry_run: safe_write(OUT, payload)
    print(json.dumps({k:v for k,v in payload.items() if k != 'records'}, ensure_ascii=False))

if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--max-pages', type=int, default=MAX_PAGES)
    args = ap.parse_args()
    collect(dry_run=args.dry_run, max_pages=min(args.max_pages, MAX_PAGES))
