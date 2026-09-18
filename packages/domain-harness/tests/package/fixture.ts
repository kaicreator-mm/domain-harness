import type {
  CapabilityId,
  CompiledPackageManifest,
  Sha256Port,
  TargetCompiledDomainPackage,
} from '../../src/v2/index.js';
import { computeCompiledPackageId } from '../../src/package/index.js';

export const TEST_POLICY_BASE = {
  formatVersion: '1',
  runtimeContractMajor: 2,
  executionEngineMajor: 1,
  targetProfileId: 'node-test',
} as const;

export function createSha256Fake(): Sha256Port {
  return {
    async digestUtf8(value: string): Promise<string> {
      return `fixture-sha256:${value}`;
    },
  };
}

export async function createCompiledPackage(
  domainVersion: string,
  options: {
    readonly requiredCapabilities?: readonly CapabilityId[];
    readonly targetProfileId?: string;
    readonly runtimeContractMajor?: number;
  } = {},
): Promise<TargetCompiledDomainPackage> {
  const manifest: CompiledPackageManifest = {
    formatVersion: TEST_POLICY_BASE.formatVersion,
    runtimeContractMajor: options.runtimeContractMajor ?? TEST_POLICY_BASE.runtimeContractMajor,
    executionEngineMajor: TEST_POLICY_BASE.executionEngineMajor,
    domainId: 'fixture-domain',
    domainVersion,
    packageId: 'pending',
    targetProfileId: options.targetProfileId ?? TEST_POLICY_BASE.targetProfileId,
    requiredCapabilities: options.requiredCapabilities ?? [],
    workflows: {},
    tools: {},
    projections: {},
    schemas: {},
    bindingDigests: {},
  };
  manifest.packageId = await computeCompiledPackageId(manifest, createSha256Fake());
  return { manifest, bindings: {} };
}
