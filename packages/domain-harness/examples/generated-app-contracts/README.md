# Generated App contracts example

This example shows the T-011 boundary: the Domain Package compiler produces an exact target-compiled manifest plus a `CompiledAppContractSource`, and `generateTypedAppContracts()` runs at build time to write a static TypeScript module for the App.

The App imports only business-facing commands, outcomes, views, watches, and Domain Events from `order-app.generated.ts`. It does not import XState state IDs, actor references, snapshot bytes, workflow routing IDs, projection routing IDs, or runtime persistence types.

Typical integration flow:

```text
Domain source
  -> target compilation
  -> exact CompiledPackageManifest + CompiledAppContractSource
  -> generateTypedAppContracts(...)
  -> app/generated/domain-contracts.ts
  -> App compile/typecheck
```

Generation is a build/package step. App startup must not discover Domain source files or compile contracts dynamically. The runtime wiring that maps these App contracts onto the v0.3 Runtime is intentionally deferred to T-021.

`consumer.ts` demonstrates using the generated surface without depending on DomainHarness engine internals.
