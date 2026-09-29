import assert from 'node:assert/strict';
import test from 'node:test';

import {
  LEGACY_COMPILED_ARTIFACT_PROFILE,
  SUCCESSOR_COMPILED_ARTIFACT_PROFILE,
} from '@kaicreator/domain-harness/v2';
import {
  compileDomainPackage,
  type LoadedRawDomainPackage,
  type TargetHostProfile,
} from '../src/index.js';
import {
  PUBLIC_COMPILER_OUTPUT_PROFILE,
  SUCCESSOR_COMPILER_PROFILE_SCAFFOLD,
} from '../src/package/profile.js';

const CRYPTO = 'crypto-hash-sha256@1' as const;
const MODULE = 'compiled-package-module@1' as const;

function rawPackage(): LoadedRawDomainPackage {
  return {
    root: '/profile-fixture',
    schemaVersion: '0.1',
    domainId: 'fixture.profile',
    limits: { maxSteps: 4 },
    workflows: new Map(),
    skills: new Map(),
    scripts: new Map(),
    schemas: new Map(),
    childDependencies: new Map(),
  };
}

const target: TargetHostProfile = {
  id: 'profile-fixture-host',
  capabilities: [CRYPTO, MODULE],
  bindings: {
    [CRYPTO]: 'portable-sha256-v1',
    [MODULE]: 'compiled-module-v1',
  },
};

const bindingContents = {
  'portable-sha256-v1': 'fixture sha256 adapter artifact',
  'compiled-module-v1': 'fixture compiled module loader artifact',
} as const;

test('I-FMT-03: compiler scaffold exposes both exact profiles but public compile remains legacy', () => {
  assert.deepEqual(PUBLIC_COMPILER_OUTPUT_PROFILE, LEGACY_COMPILED_ARTIFACT_PROFILE);
  assert.deepEqual(SUCCESSOR_COMPILER_PROFILE_SCAFFOLD, SUCCESSOR_COMPILED_ARTIFACT_PROFILE);

  const compiled = compileDomainPackage({
    raw: rawPackage(),
    domainVersion: 'post-v0.4-fixture',
    target,
    bindingContents,
  });

  assert.equal(compiled.manifest.formatVersion, PUBLIC_COMPILER_OUTPUT_PROFILE.formatVersion);
  assert.equal(compiled.manifest.runtimeContractMajor, PUBLIC_COMPILER_OUTPUT_PROFILE.runtimeContractMajor);
  assert.equal(compiled.manifest.executionEngineMajor, PUBLIC_COMPILER_OUTPUT_PROFILE.executionEngineMajor);
  assert.notEqual(compiled.manifest.formatVersion, SUCCESSOR_COMPILER_PROFILE_SCAFFOLD.formatVersion);
});
