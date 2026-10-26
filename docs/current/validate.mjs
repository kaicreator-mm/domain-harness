#!/usr/bin/env node
/**
 * Minimal bilingual documentation guard (docs-only; no runtime dependencies).
 * Usage from repository root: node docs/current/validate.mjs
 * Enforces file pairing, reciprocal language navigation, local relative links,
 * balanced fenced code blocks and both index references for every topic.
 * Does NOT prove Chinese/English semantic equivalence or execute embedded code.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const zh = join(here, 'zh-CN');
const en = join(here, 'en');
const errors = [];

function markdownNames(folder) {
  return readdirSync(folder).filter(x => x.endsWith('.md')).sort();
}
const cn = markdownNames(zh);
const eng = markdownNames(en);
for (const name of cn) if (!eng.includes(name)) errors.push('English pair missing: ' + name);
for (const name of eng) if (!cn.includes(name)) errors.push('Chinese pair missing: ' + name);

function checkFile(file, counterpart) {
  const text = readFileSync(file, 'utf8');
  const current = basename(file);
  const switchLink = '../' + counterpart + '/' + current;
  if (!text.includes('](' + switchLink + ')')) errors.push(file + ': language switch missing');
  if (current !== 'index.md' && !text.includes('](index.md)')) errors.push(file + ': index link missing');
  const fenceLines = text.split(/\r?\n/).filter(line => /^\s*`{3,}|^\s*~{3,}/.test(line));
  if (fenceLines.length % 2 !== 0) errors.push(file + ': unbalanced code fences');
  // Markdown links are intentionally checked, but raw source or inline code is not modified.
  for (const match of text.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
    const destination = match[1].split('#')[0];
    if (!destination || /^(https?:|mailto:|\/\/)/.test(destination)) continue;
    const absolute = resolve(dirname(file), decodeURIComponent(destination));
    if (!absolute.startsWith(root + '/') && absolute !== root) {
      errors.push(file + ': path escapes repository: ' + destination);
      continue;
    }
    if (!existsSync(absolute)) errors.push(file + ': dead relative link: ' + destination);
  }
  if (text.trim().length < 350) errors.push(file + ': suspiciously short translation');
}
for (const name of cn) if (eng.includes(name)) {
  checkFile(join(zh, name), 'en');
  checkFile(join(en, name), 'zh-CN');
}
const zhIndex = readFileSync(join(zh, 'index.md'), 'utf8');
const enIndex = readFileSync(join(en, 'index.md'), 'utf8');
for (const name of cn) {
  if (name === 'index.md') continue;
  if (!zhIndex.includes('](' + name + ')')) errors.push('Chinese index missing topic: ' + name);
  if (!enIndex.includes('](' + name + ')')) errors.push('English index missing topic: ' + name);
}
if (errors.length) {
  console.error('Bilingual documentation validation failed:\n' + errors.map(e => '- ' + e).join('\n'));
  process.exitCode = 1;
} else {
  console.log('Bilingual docs OK: ' + cn.length + ' paired topics, reciprocal links and local paths verified.');
}
