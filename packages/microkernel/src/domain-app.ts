/** DomainApp 公开状态/已选 Element-Function 身份与 Exit；业务仅由 Init/未来 Workflow 执行。 */
import type { AppStatus, DomainApp, DomainAppInspection, DomainAppLock } from '@kaicreator/domain-harness-contracts';
import { PackageSystem } from './package-system.js';

export interface DomainAppDeps {
  readonly lock: DomainAppLock;
  readonly packages: PackageSystem;
  readonly initialStatus: AppStatus;
}
export function createDomainApp(deps: DomainAppDeps): DomainApp {
  const { lock, packages } = deps;
  let disposeFlight: Promise<{ readonly status: 'DISPOSED' }> | null = null;
  const inspect = (): Promise<DomainAppInspection> => Promise.resolve({
    appIdentity: { id: lock.appIdentity.id, version: lock.appIdentity.version, lockDigest: lock.closureDigest },
    target: { ...lock.target },
    packages: lock.selectedPackages.map((p) => ({
      packageId: p.packageId, version: p.version, layer: p.layer, role: p.role,
    })),
    elements: lock.selectedElements.map((e) => ({
      ref: { ...e.ref }, ownerPackageId: e.ownerPackageId, visibility: e.visibility,
    })),
    // KDP Host Init 是进程内特权能力，不是可检查的普通领域 Function。
    functions: lock.selectedFunctions.filter((fn) => fn.invocationAbi !== 'kdp-host-init/1').map((fn) => ({
      ref: { ...fn.ref, element: { ...fn.ref.element } },
      outcomes: [...fn.outcomes!], effects: fn.effects!,
    })),
  });
  const dispose = (): Promise<{ readonly status: 'DISPOSED' }> => {
    if (disposeFlight === null) {
      disposeFlight = packages.runExit().then(() => ({ status: 'DISPOSED' as const }));
    }
    return disposeFlight;
  };
  return { get status(): AppStatus { return deps.initialStatus; }, inspect, dispose };
}
