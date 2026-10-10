/**
 * Public experiment API — `const runtime = await DomainHarness.load(package)`
 * ==========================================================================
 *
 * The experiment's public consumption abstraction (#993 / #942 UD-02):
 * `package` is the trusted, producer-controlled sealed Domain Package root
 * (fixed build-produced closure and target bindings). There is no
 * `compiledApp` parameter and no runtime raw compilation. The physically
 * selected Kernel Domain Package owns the entire authoritative
 * State/Admission/Guard/Effect/Journal/Replay mechanism (see
 * src/producer/payload/kernel-mechanism-v1.mjs for the v0.7 migration
 * attribution).
 */

export { load } from './src/microkernel/load.mjs';
export { MicrokernelError, KERNEL_ABI } from './src/microkernel/contracts.mjs';
export { buildPackageRoot, ProducerError } from './src/producer/build-package.mjs';
export { createMemoryHost } from './src/host/memory-host.mjs';
export { createFileHost } from './src/host/file-host.mjs';
