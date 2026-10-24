const contractsSource = typeof require === 'function'
    ? require('../../../contracts/dist/index.js')
    : globalThis.process?.getBuiltinModule?.('module')?.createRequire(import.meta.url)(import.meta.resolve('@kaicreator/domain-harness-contracts'));
export const { IdentityContractError, canonicalizeJson, canonicalJsonStringify, computeCanonicalJsonDigest, isContentDigest, } = contractsSource;
//# sourceMappingURL=identity.js.map