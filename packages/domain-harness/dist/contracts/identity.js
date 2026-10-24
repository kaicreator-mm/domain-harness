const nodeBuiltin = globalThis.process
    ?.getBuiltinModule;
const contractsSource = typeof require === 'function'
    ? require('../../../contracts/dist/index.js')
    : (() => {
        const createRequire = nodeBuiltin?.('module')?.createRequire;
        const fileURLToPath = nodeBuiltin?.('url')?.fileURLToPath;
        if (createRequire === undefined || fileURLToPath === undefined) {
            throw new Error('contracts identity re-export needs a Node ESM or bundler-CJS host; a plain bare re-export returns once the contracts manifest owns a require condition (T07b)');
        }
        return createRequire(import.meta.url)(fileURLToPath(import.meta.resolve('@kaicreator/domain-harness-contracts')));
    })();
export const { IdentityContractError, canonicalizeJson, canonicalJsonStringify, computeCanonicalJsonDigest, isContentDigest, } = contractsSource;
//# sourceMappingURL=identity.js.map