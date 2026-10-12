/**
 * v0.8 trusted Host ModelPort channel — INTERNAL protected (#1013, I04).
 * =======================================================================
 *
 * FR08: a selected Standard-SDK package may mark model-call evidence
 * `measured(count)` ONLY for invocations physically observed through a
 * Host-provisioned ModelPort binding. The factory on the SDK side
 * (`createHostBoundModelResolver`, T-D) explicitly does not authenticate
 * Host authority — the trust comes from HERE: a one-shot, governance/
 * Host-bootstrap-only installation that is never re-exported from the
 * public `@kaicreator/domain-harness/v8` surface (same protection pattern
 * as kernel-host.ts and trust.ts).
 *
 * Who may install: `bootstrapTrustedHost` (host-v8/bootstrap.ts), carrying
 * a deployment-provisioned port object. A process that installed nothing
 * resolves NO port — the loader then wires the SDK's plain `interpret` and
 * model-call evidence stays honestly `unsupported`/`unmeasured`. There is
 * deliberately no synthetic measured-zero anywhere on this path.
 */
/** The Host-provisioned model port shape the selected SDK consumes. */
export interface V8HostModelPort {
    readonly invoke: (request: {
        readonly operation: string;
        readonly input: unknown;
    }) => unknown;
}
/**
 * Validate a prospective ModelPort installation WITHOUT consuming the
 * one-shot channel (#1013 R1 F-01): occupancy and the direct-callable
 * shape both fail here first, so the Host bootstrap can preflight ALL
 * one-shot channels (trust, kernel, ModelPort) before committing ANY.
 * Internal protected; not re-exported from the public `/v8` surface.
 */
export declare function preflightHostModelPort(port: unknown): void;
/**
 * Install the trusted Host ModelPort for this process. Internal protected
 * bootstrap: one-shot (a second installation attempt fails typed).
 */
export declare function installHostModelPort(port: unknown): void;
/**
 * The installed trusted ModelPort, or `undefined` when this process
 * bootstrapped without one. Absence is a legitimate honest state (FR08:
 * `unsupported`/`unmeasured`), never an error and never a fallback port.
 */
export declare function currentHostModelPort(): V8HostModelPort | undefined;
//# sourceMappingURL=model-port.d.ts.map