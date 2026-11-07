import type { openSqliteCasStore } from '@kaicreator/domain-harness/v8/host';
import type { V10PublicIntent } from '@kaicreator/domain-harness-contracts';
import type { digest } from './knowledge.js';
import type { attachConsumer } from './provider-bindings.js';
import type { ObjectData } from './types.js';

const kernelId = 'v08-kernel-mechanism@1.0.0';
const workflowId = 'kdp-qualified-read';
const operation = 'dis.consume';
const capability = 'dis-player';
const event = 'QUALIFIED_READ_REQUESTED';
const ruleId = 'rule:kdp-read';
const intentType = 'recognizePlayer';
const effect = 'effect:dis-read';

type Target = { workflowId: string; instanceKey: string };
type PhysicalCondition = Parameters<Awaited<ReturnType<typeof openSqliteCasStore>>['put']>[2];
type KernelRuntime = {
  getSnapshot(target: Target): Promise<unknown>;
  openInstance(request: { target: Target; correlationId: string; authorityClass: string }): Promise<unknown>;
  submitOccurrence(request: ObjectData): Promise<ObjectData>;
};

/** KDP's local read envelope. No app policy or selected provider is needed to
 * initialize the one Kernel. The Package System binds the port once afterwards. */
export async function startKdpPrimary(options: {
  kernelSource: string; kernelSha256: string; primarySha256: string; lockSha256: string; sqlitePath: string;
  openSqliteCasStore: typeof openSqliteCasStore; attachConsumer: typeof attachConsumer; digest: typeof digest;
}) {
  if (options.digest(options.kernelSource) !== options.kernelSha256) throw new Error('UNTRUSTED_SELECTED_KERNEL');
  const moduleUrl = 'data:text/javascript;base64,' + Buffer.from(options.kernelSource).toString('base64');
  const kernel = await import(moduleUrl) as {
    MODULE_ID: string;
    createOccurrenceRuntime(options: ObjectData): KernelRuntime;
    kernelDocKeys(scope?: unknown): {
      journal(effectId: string): string;
      effectPermit(effectId: string): string;
      effectDispatchClaim(effectId: string, attempt: number): string;
    };
  };
  if (kernel.MODULE_ID !== kernelId || typeof kernel.createOccurrenceRuntime !== 'function') {
    throw new Error('KERNEL_ENTRY_INVALID');
  }
  const host = await options.openSqliteCasStore({ path: options.sqlitePath });
  const prefix = 'dis-kdp/tenant:dis-reference/' + options.lockSha256 + '/';
  const keyFamily = kernel.kernelDocKeys();
  let attached: Awaited<ReturnType<typeof attachConsumer>> | undefined;
  let closed = false;
  let attaching = false;
  const assertOpen = () => { if (closed) throw new Error('KDP_CLOSED'); };
  const getAttachment = () => {
    assertOpen();
    if (!attached) throw new Error('KDP_PACKAGE_UNATTACHED');
    return attached;
  };
  let runtime: KernelRuntime;
  try {
    runtime = kernel.createOccurrenceRuntime({
      moduleIdentity: { packageId: kernelId, moduleSha256: options.kernelSha256 },
      hostPorts: {
        docs: {
          get: (key: string) => host.get(prefix + key),
          put: (key: string, value: unknown, condition: PhysicalCondition) => host.put(prefix + key, value, condition),
          remove: (key: string, condition: PhysicalCondition) => host.remove(prefix + key, condition),
          list: async (key: string) => (await host.list(prefix + key)).map((absolute) => absolute.slice(prefix.length)),
        },
        sha256: { digestUtf8: options.digest },
        resources: {
          call(resource: unknown, method: unknown, payload: unknown) {
            if (resource !== capability || method !== operation) throw new Error('KDP_OPERATION_UNAUTHORIZED');
            return getAttachment().consume(payload);
          },
        },
      },
      sdkEndpoint: {
        packageId: 'dis-kdp-read-envelope@0.11.0-dev.0',
        interpret(rule: ObjectData, input: ObjectData) {
          if (rule.ruleId !== ruleId || !Object.hasOwn(input, 'observation')) throw new Error('KDP_READ_ENVELOPE_INVALID');
          const payload = { observation: input.observation };
          return { structuredDecision: { decision: { outcome: 'decide', data: payload }, event: { type: event, payload } },
            source: 'harness-machine', llmAvoided: true, modelCallEvidence: { status: 'unsupported' },
            cacheDisposition: { read: 'disabled' }, telemetry: [] };
        },
      },
      businessEndpoint: {
        packageId: 'dis-kdp-read-protocol@0.11.0-dev.0', policyId: workflowId, domainId: 'kdp',
        workflowDefinition: { workflowKey: workflowId, initialState: 'ready', initialContext: {}, guards: [],
          states: [{ stateKey: 'ready', transitions: [{ transitionKey: 'read', trigger: { kind: 'event', eventType: event },
            targetState: 'ready', effectIntents: [{ effectType: effect,
              inputFrom: { observation: { source: 'event', path: ['payload', 'observation'] } } }] }] }] },
        decisionSchema: { isValid: (value: { event?: { type: string }; decision?: { outcome: string } }) =>
          value?.event?.type === event && value?.decision?.outcome === 'decide' },
        governanceSemantics: { hardInvariants: [] }, initialStateKey: 'ready', initialContext: {},
        rules: { [ruleId]: { ruleId, eventType: event, payloadFromInput: { observation: 'observation' } } },
        intentBindings: { [intentType]: { trigger: { kind: 'event', eventType: event }, ruleId, roles: ['requester'] } },
        effectBindings: { [effect]: { semantics: 'idempotent', resource: { key: capability, operation },
          handler: ({ input, resources }: { input: ObjectData; resources: { call: (r: string, op: string, value: unknown) => unknown } }) =>
            resources.call(capability, operation, input.observation) } },
      },
    });
  } catch (error) {
    await host.close();
    throw error;
  }
  return Object.freeze({
    identity: Object.freeze({ primary: 'dis-kdp-primary@0.11.0-dev.0', primarySha256: options.primarySha256,
      kernelId, kernelSha256: options.kernelSha256, runtimeInstances: 1 }),
    async attach(built: Parameters<typeof attachConsumer>[0]) {
      assertOpen();
      if (attached || attaching) throw new Error('KDP_ALREADY_ATTACHING_OR_ATTACHED');
      attaching = true;
      try {
        const loaded = await options.attachConsumer(built, options.lockSha256, options.kernelSha256);
        assertOpen();
        attached = loaded;
      } finally {
        attaching = false;
      }
    },
    async send(intent: V10PublicIntent) {
      const active = getAttachment();
      if (intent.intentType !== intentType || Object.keys(intent).some((key) => !['intentType','instanceKey','messageId','input'].includes(key))) {
        throw new Error('KDP_OPERATION_UNAUTHORIZED');
      }
      active.authorize(intent.intentType);
      const target = { workflowId, instanceKey: intent.instanceKey };
      if (await runtime.getSnapshot(target) == null) {
        try {
          await runtime.openInstance({ target, correlationId: 'corr:' + intent.messageId, authorityClass: 'PRODUCTION' });
        } catch (error) {
          if (!['HOST_CAS_CONFLICT', 'HOST_KEY_EXISTS'].includes((error as {code?: string}).code ?? '')) throw error;
        }
      }
      return runtime.submitOccurrence({ kind: 'v08/tc-intent', intentType, target,
        messageId: intent.messageId, input: intent.input, caller: { role: 'requester' } });
    },
    async readOccurrence(effectId: string) {
      getAttachment();
      if (!/^turn:[a-zA-Z0-9%:._-]+\/effect\/[1-9][0-9]*$/.test(effectId)) throw new Error('INVALID_EFFECT_ID');
      const key = prefix + keyFamily.journal(effectId);
      const [document, permit, dispatchClaims] = await Promise.all([
        host.get(key),
        host.get(prefix + keyFamily.effectPermit(effectId)),
        host.list(prefix + keyFamily.effectDispatchClaim(effectId, 1).slice(0, -1)),
      ]);
      return { key, document, permit, dispatchClaims, kernelModuleSha256: options.kernelSha256 };
    },
    async close() {
      if (!closed) { closed = true; await host.close(); }
    },
  });
}
