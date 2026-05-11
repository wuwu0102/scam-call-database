#!/usr/bin/env python3
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCAM = ROOT/'scam_numbers.json'
IOS = ROOT/'data/ios_numbers.json'
STATS = ROOT/'data/public_stats.json'
BACKUP = ROOT/'data/backups/scam_numbers.backup.json'

ALLOWED = {'fraud', 'spam', 'telemarketing', 'debt_collection'}

scam = json.loads(SCAM.read_text())
ios = json.loads(IOS.read_text())
stats = json.loads(STATS.read_text())
backup = json.loads(BACKUP.read_text()) if BACKUP.exists() else []

seen=set(); dups=[]; empty=[]; bad=[]; explicit_unknown=[]
for r in scam:
    n=(r.get('number') or '').strip()
    if not n: empty.append(r); continue
    if not (n.startswith('+52') and len(n)==13 and n[3:].isdigit()): bad.append(n)
    cat = (r.get('category') or '').strip().lower()
    if cat == 'unknown':
        explicit_unknown.append(n)
    if n in seen: dups.append(n)
    seen.add(n)

if empty: raise SystemExit(f'empty numbers: {len(empty)}')
if bad: raise SystemExit(f'invalid normalized numbers: {len(bad)}')
if dups: raise SystemExit(f'duplicate e164: {len(dups)}')
if explicit_unknown: raise SystemExit(f'unknown category not allowed in scam_numbers.json: {len(explicit_unknown)}')
if len(backup) and len(scam) < len(backup):
    raise SystemExit(f'scam_numbers.json decreased: now={len(scam)} backup={len(backup)}')

scam_count = len(scam)
ios_count = len(ios)
stats_count = int(stats.get('totalSearchableCount') or 0)
if stats_count != scam_count:
    raise SystemExit(f'stats count mismatch: stats={stats_count} scam={scam_count}')

print(f'OK scam={scam_count} ios={ios_count} stats={stats_count}')
