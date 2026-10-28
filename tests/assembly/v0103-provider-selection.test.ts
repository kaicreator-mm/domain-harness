import './cjs-package-bridge.ts';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import type { V10ModuleInput } from '@kaicreator/domain-harness-contracts';
import { buildV10App } from '../../tooling/build/dist/index.js';
import { basicComposition, sha256HexSource } from './helpers-v010.ts';

const providers = [
  { id: 'openai', packageId: 'capability-llm-openai-compatible', capabilityId: 'llm.openai',
    operationId: 'llm.openai.generate', intentId: 'llmViaOpenAI',
    source: '../../domain-packages/capabilities/llm-openai-compatible/module.mjs', npm: ['domain-harness-openai-host'] },
  { id: 'anthropic', packageId: 'capability-llm-anthropic-messages', capabilityId: 'llm.anthropic',
    operationId: 'llm.anthropic.generate', intentId: 'llmViaAnthropic',
    source: '../../domain-packages/capabilities/llm-anthropic-messages/modules/capability-llm-anthropic-messages.mjs', npm: [] },
] as const;

test('BUILD seals only explicitly selected provider modules and distinct routes', async () => {
  for (const selected of [[], [providers[0]], [providers[1]], [...providers]] as const) {
    const base = await basicComposition();
    const entries: V10ModuleInput[] = await Promise.all(selected.map(async p => {
      const moduleSource = await readFile(new URL(p.source, import.meta.url), 'utf8');
      return { packageId: p.packageId, role: 'capability', abiVersion: 'v08-capability-abi/1',
        moduleSource, moduleSha256: sha256HexSource(moduleSource), endpoint: 'capability-endpoint',
        dependencies: [], provides: [`capability:${p.capabilityId}/1`], requires: [],
        capabilityId: p.capabilityId, externalEffect: true,
        handlers: [{ operationId: p.operationId, handler: 'generate' }],
        externalImports: { node: [], npm: [...p.npm], native: [] } };
    }));
    const modules = base.modules.map(m => m.role === 'business'
      ? { ...m, provides: [...(m.provides ?? []), ...selected.map(p => `intent:${p.intentId}`)] } : m);
    const routes = [...base.routes, ...selected.map(p => ({ intentId: p.intentId, operationId: p.operationId,
      capabilityId: p.capabilityId, handlerId: 'generate' }))];
    const app = buildV10App({ ...base, modules: [...modules, ...entries], routes });
    for (const p of providers) {
      assert.equal(app.modules.some(m => m.packageId === p.packageId), selected.some(s => s.id === p.id));
      if (!selected.some(s => s.id === p.id)) {
        assert.throws(() => buildV10App({ ...base, modules: [...modules, ...entries], routes: [...routes,
          { intentId: p.intentId, operationId: p.operationId, capabilityId: p.capabilityId, handlerId: 'generate' }] }),
        { code: 'V10_ROUTE_INVALID' });
      }
    }
  }
});
