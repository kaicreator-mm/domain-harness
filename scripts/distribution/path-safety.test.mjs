import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import {
  assertExternalOutput, physicalPathOrExistingAncestor,
  withinOrEqual, validateOutputArg,
} from './path-safety.mjs';

test('output outside checkout succeeds; direct checkout and nested child refused', () => {
  const root = mkdtempSync(join(tmpdir(), 'dh-dist-test-'));
  const source = join(root, 'project');
  const outside = join(root, 'outside');
  mkdirSync(source);
  mkdirSync(outside);
  try {
    assert.doesNotThrow(() => assertExternalOutput(source, outside));
    assert.throws(() => assertExternalOutput(source, source), /physically outside/);
    assert.throws(() => assertExternalOutput(source, join(source, 'new-empty-child')),
      /physically outside/);
    assert.equal(physicalPathOrExistingAncestor(join(outside, 'not-created')),
      resolve(outside, 'not-created'));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('existing symlink alias into checkout refused (junction equivalent)', () => {
  const root = mkdtempSync(join(tmpdir(), 'dh-dist-link-test-'));
  const source = join(root, 'project');
  const alias = join(root, 'alias');
  mkdirSync(source);
  try {
    symlinkSync(source, alias, process.platform === 'win32' ? 'junction' : 'dir');
    assert.throws(() => assertExternalOutput(source, join(alias, 'new-empty-child')),
      /physically outside/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('Windows logical boundary is case insensitive and checks path-component boundary', () => {
  assert.equal(withinOrEqual('C:\\xDev\\Repo', 'c:\\XDEV\\REPO\\out', 'win32'), true);
  assert.equal(withinOrEqual('C:\\xDev\\Repo', 'c:\\XDEV\\repo', 'win32'), true);
  assert.equal(withinOrEqual('C:\\xDev\\Repo', 'c:\\xdev\\Repo2\\out', 'win32'), false);
  assert.equal(withinOrEqual('C:\\xDev\\Repo', 'd:\\xdev\\Repo\\out', 'win32'), false);
});

test('CMD argument is absolute and rejects parentheses and metacharacters', () => {
  const safe = resolve(tmpdir(), 'dh-safe-out');
  assert.doesNotThrow(() => validateOutputArg(safe));
  for (const bad of ['temp(folder)', 'temp)folder', 'bad&name', 'bad name', 'bad%name']) {
    assert.throws(() => validateOutputArg(resolve(tmpdir(), bad)), /metacharacters/);
  }
  assert.throws(() => validateOutputArg('relative-target'), /absolute/);
});
