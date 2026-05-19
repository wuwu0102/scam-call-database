#!/usr/bin/env node

const { execSync } = require('node:child_process');

const ALLOWED_EXACT = new Set([
  'README.md',
  'AGENTS.md',
  'CLAUDE.md',
  'index.html',
  'package.json',
  'scripts/check_protected_files.js'
]);

const ALLOWED_PREFIX = ['docs/'];

const isProtectedPath = (filePath) => {
  if (filePath === 'scam_numbers.json') return true;
  if (filePath.startsWith('.github/workflows/')) return true;
  if (filePath.startsWith('data/')) {
    return /\.(json|csv|txt)$/i.test(filePath);
  }
  return false;
};

const isAllowedException = (filePath) => {
  if (ALLOWED_EXACT.has(filePath)) return true;
  return ALLOWED_PREFIX.some((prefix) => filePath.startsWith(prefix));
};

const getChangedFiles = () => {
  const commands = ['git diff --name-only main...HEAD', 'git diff --name-only'];
  for (const cmd of commands) {
    try {
      const out = execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      const files = out
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
      if (files.length > 0 || cmd === commands[commands.length - 1]) {
        return files;
      }
    } catch (_) {
      // try next command
    }
  }
  return [];
};

const changedFiles = getChangedFiles();
const violations = changedFiles.filter((file) => isProtectedPath(file) && !isAllowedException(file));

if (violations.length > 0) {
  console.error('❌ Protected files were modified. Please revert these files before merge:');
  violations.forEach((file) => console.error(` - ${file}`));
  process.exit(1);
}

console.log('✅ Protected file check passed.');
if (changedFiles.length > 0) {
  console.log('Changed files in this branch/working tree:');
  changedFiles.forEach((file) => console.log(` - ${file}`));
} else {
  console.log('No changes detected.');
}
