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
 * The session capability is validated with the port (the boundary can
 * never exist without its key). Internal protected; not re-exported from
 * the public `/v8` surface.
 */
export declare function preflightHostModelPort(port: unknown, sessionCap: unknown): void;
/**
 * Install the trusted Host ModelPort for this process together with the
 * session capability that gates every read back. Internal protected
 * bootstrap: one-shot (a second installation attempt fails typed).
 *
 * #1013 R3 (@6138090328): when the bootstrap preflight staged a snapshot
 * for THIS port object, the install consumes exactly that staged callable
 * and performs NO read of the caller's object after the one-shot
 * trust/kernel/session commits — preflight→install drift is neutralized by
 * construction. Without a staged snapshot (direct installation), the
 * callable is captured from its SINGLE descriptor read inside
 * `validatedDirectInvoke` and THAT snapshotted function is what gets
 * installed. Either way the get result is only ever compared, never
 * installed; a Proxy whose descriptor trap is truthful but whose get trap
 * drifts `invoke` refuses TYPED (MODEL_PORT_INVALID) at preflight — BEFORE
 * any channel state mutates — so the pre-repair post-commit `.bind` crash
 * (a half-bootstrapped process that defeated the R1 F-01 zero-residue
 * property) cannot exist in either path.
 */
export declare function installHostModelPort(port: unknown, sessionCap: unknown): void;
/**
 * The installed trusted ModelPort, or `undefined` when this process
 * bootstrapped without one. Absence is a legitimate honest state (FR08:
 * `unsupported`/`unmeasured`), never an error and never a fallback port.
 *
 * #1013 R2 fresh review @5494026032 (NEW_P1_02): with a port installed, the
 * caller must present the EXACT session capability that was installed with
 * it — a wrong or absent capability is refused typed
 * (MODEL_PORT_SESSION_DENIED) before the frozen `{invoke}` object can be
 * reached, so a same-process deep importer can never invoke the model
 * outside the qualified S `model-decision` declaration selection and the
 * truthful per-domain model-call evidence/accounting path. The capability
 * never exists in this module's exports.
 */
export declare function currentHostModelPort(sessionCap?: unknown): V8HostModelPort | undefined;
//# sourceMappingURL=model-port.d.ts.map