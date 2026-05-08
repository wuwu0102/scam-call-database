#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const reportPath = path.join(ROOT, 'data', 'scrape_report.json');
const scamPath = path.join(ROOT, 'scam_numbers.json');

const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
const scam = JSON.parse(fs.readFileSync(scamPath, 'utf8'));
if (!Array.isArray(scam)) throw new Error('scam_numbers.json is not array');
const seen = new Set();
for (const row of scam) {
  const n = String(row.number || '');
  if (seen.has(n)) throw new Error(`duplicate number: ${n}`);
  if (['+52911', '+52089', '+52088', '+52070', '+52072'].some((prefix) => n.startsWith(prefix)) || n.startsWith('+52800') || n.startsWith('+5201800')) {
    throw new Error(`banned number: ${n}`);
  }
  seen.add(n);
}

const promoted = Number(report.promotedThisRun || 0);
const accepted = Number(report.acceptedCandidates || 0);
const before = Number(report.officialBefore || 0);
const after = Number(report.officialAfter || 0);

if (promoted > 300) process.exit(1);
if (accepted > 1500) process.exit(1);
if (after < before) process.exit(1);
if (after > before + 300) process.exit(1);

console.log('Scrape anomaly check OK');
