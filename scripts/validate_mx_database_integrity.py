#!/usr/bin/env python3
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCAM = ROOT/'scam_numbers.json'
IOS = ROOT/'data/ios_numbers.json'
STATS = ROOT/'data/public_stats.json'

scam = json.loads(SCAM.read_text())
ios = json.loads(IOS.read_text())
stats = json.loads(STATS.read_text())

seen=set(); dups=[]; empty=[]; bad=[]
for r in scam:
    n=(r.get('number') or '').strip()
    if not n: empty.append(r); continue
    if not (n.startswith('+52') and len(n)==13 and n[3:].isdigit()): bad.append(n)
    if n in seen: dups.append(n)
    seen.add(n)

if empty: raise SystemExit(f'empty numbers: {len(empty)}')
if bad: raise SystemExit(f'invalid normalized numbers: {len(bad)}')
if dups: raise SystemExit(f'duplicate e164: {len(dups)}')

scam_count = len(scam)
ios_count = len(ios)
if ios_count < max(1, int(scam_count*0.001)):
    raise SystemExit(f'iOS export too small vs main db: ios={ios_count} scam={scam_count}')

stats_count = int(stats.get('totalSearchableCount') or 0)
if stats_count != max(scam_count, len(json.loads((ROOT/'data/collected_mexico_numbers.json').read_text()))):
    raise SystemExit('stats count mismatch with expected searchable count')

print(f'OK scam={scam_count} ios={ios_count} stats={stats_count}')
