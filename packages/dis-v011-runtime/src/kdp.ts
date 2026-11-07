import { load } from '@kaicreator/domain-harness-microkernel';
import { openSqliteCasStore } from '@kaicreator/domain-harness/v8/host';
import type { V10BuiltApp, V10DocStore } from '@kaicreator/domain-harness-contracts';

/** Boot selects the single KDP assembly. The selected Kernel retains CAS and Journal ownership. */
export async function bootKdp(app: V10BuiltApp, sqlitePath: string) {
  const kernels = app.modules.filter((module) => module.role === 'kernel-primary');
  if (kernels.length !== 1) throw new Error('KDP_REQUIRES_ONE_SELECTED_KERNEL');
  const tenantId = 'tenant:dis-reference';
  const host = await openSqliteCasStore({ path: sqlitePath });
  const store: V10DocStore = {
    get: (key) => host.get(key),
    put: (key, value, condition) => host.put(key, value, condition.kind === 'create'
      ? { mustBeAbsent: true } : { mustMatchRevision: condition.revision }),
  };
  try {
    const domain = await load(app, { store, tenantId });
    return {
      send: domain.send,
      async readOccurrence(effectId: string) {
        if (!/^turn:[a-zA-Z0-9%:._-]+\/effect\/[1-9][0-9]*$/.test(effectId)) throw new Error('INVALID_EFFECT_ID');
        // Read-only adapter for the selected Kernel's existing key contract.
        // activation.ts prefixes v10/k/<subjectDigest>/<tenantId>/ before K writes.
        const prefix = 'v10/k/' + app.subjectDigest + '/' + tenantId + '/v08-kernel:';
        const key = prefix + 'effect-journal:' + effectId;
        const [document, permit, dispatchClaims] = await Promise.all([
          host.get(key),
          host.get(prefix + 'effect-permit:' + effectId),
          host.list(prefix + 'effect-dispatch-claim:' + effectId + '/attempt/'),
        ]);
        return { key, document, permit, dispatchClaims, kernelModuleSha256: kernels[0].moduleSha256 };
      },
      async close() { domain.stop(); await host.close(); },
    };
  } catch (error) {
    await host.close();
    throw error;
  }
}
