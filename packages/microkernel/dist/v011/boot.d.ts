import type { BootResult, BootstrapPin, KdpBootstrapContext } from '@kaicreator/domain-harness-contracts/v011';
/**
 * Minimal Boot: verify, then hand off to the one pinned KDP Primary.
 * Never parses Package DAGs, never preloads SDK/Business/Extensions.
 */
export declare function boot(pin: BootstrapPin, context: KdpBootstrapContext): Promise<BootResult>;
