export const SCRIPT_EXECUTION_CAPABILITY = 'script-execution@1';
export const SCRIPT_BINDING_KIND = 'script';
export const SCRIPT_ARTIFACT_FORMAT = 'target-compiled-script@1';
export class ScriptCompileError extends Error {
    code;
    cause;
    constructor(code, message, cause) {
        super(message);
        this.code = code;
        this.cause = cause;
        this.name = 'ScriptCompileError';
    }
}
const EXPO_FORBIDDEN_IMPORT_PREFIXES = ['node:'];
const EXPO_FORBIDDEN_IMPORTS = new Set(['worker_threads']);
const EXPO_FORBIDDEN_GLOBALS = new Set(['Worker', 'Buffer', 'process', 'require', '__dirname', '__filename']);
export async function bundleScriptTool(request, engine) {
    validateRequest(request);
    validateCapability(request.targetProfile);
    let result;
    try {
        result = await engine.bundle({
            sourcePath: request.sourcePath,
            source: request.source,
            language: request.language,
            target: request.target,
            format: 'esm',
            ecmaTarget: 'es2022',
            bundle: true,
            hermesSafe: request.target === 'expo',
        });
    }
    catch (error) {
        throw new ScriptCompileError('bundle_failed', `Script bundle failed for '${request.bindingId}': ${errorMessage(error)}`, error);
    }
    validateBundleResult(request, result);
    const moduleId = `scripts/${encodeURIComponent(request.bindingId)}.${request.target}.mjs`;
    return {
        moduleSource: result.code,
        moduleId,
        target: request.target,
        targetProfileId: request.targetProfile.id,
        requiredCapability: SCRIPT_EXECUTION_CAPABILITY,
        binding: {
            kind: SCRIPT_BINDING_KIND,
            bindingId: request.bindingId,
            config: {
                artifactFormat: SCRIPT_ARTIFACT_FORMAT,
                target: request.target,
                moduleId,
                exportName: 'default',
            },
        },
    };
}
function validateRequest(request) {
    if (request.bindingId.trim() === '') {
        throw new ScriptCompileError('invalid_request', 'Script bindingId must be non-empty');
    }
    if (request.sourcePath.trim() === '') {
        throw new ScriptCompileError('invalid_request', 'Script sourcePath must be non-empty');
    }
    if (request.source.trim() === '') {
        throw new ScriptCompileError('invalid_request', `Script source is empty for '${request.bindingId}'`);
    }
    if (request.targetProfile.id.trim() === '') {
        throw new ScriptCompileError('invalid_request', 'Target host profile id must be non-empty');
    }
}
function validateCapability(profile) {
    if (!profile.capabilities.includes(SCRIPT_EXECUTION_CAPABILITY)) {
        throw new ScriptCompileError('missing_capability', `Target host '${profile.id}' does not provide ${SCRIPT_EXECUTION_CAPABILITY}`);
    }
    const binding = profile.bindings[SCRIPT_EXECUTION_CAPABILITY];
    if (typeof binding !== 'string' || binding.trim() === '') {
        throw new ScriptCompileError('missing_capability_binding', `Target host '${profile.id}' has no binding for ${SCRIPT_EXECUTION_CAPABILITY}`);
    }
}
function validateBundleResult(request, result) {
    if (result.language !== 'javascript' || result.bundled !== true || result.code.trim() === '') {
        throw new ScriptCompileError('invalid_bundle', `Bundler did not produce non-empty bundled JavaScript for '${request.bindingId}'`);
    }
    if (!result.exports.includes('default')) {
        throw new ScriptCompileError('invalid_bundle', `Script bundle '${request.bindingId}' must default-export execute(input)`);
    }
    if (request.target !== 'expo')
        return;
    const forbiddenImport = (result.externalImports ?? []).find((specifier) => EXPO_FORBIDDEN_IMPORT_PREFIXES.some((prefix) => specifier.startsWith(prefix)) ||
        EXPO_FORBIDDEN_IMPORTS.has(specifier));
    if (forbiddenImport !== undefined) {
        throw new ScriptCompileError('expo_incompatible_bundle', `Expo Script bundle '${request.bindingId}' retains forbidden import '${forbiddenImport}'`);
    }
    const forbiddenGlobal = (result.runtimeGlobals ?? []).find((name) => EXPO_FORBIDDEN_GLOBALS.has(name));
    if (forbiddenGlobal !== undefined) {
        throw new ScriptCompileError('expo_incompatible_bundle', `Expo Script bundle '${request.bindingId}' requires unsupported runtime global '${forbiddenGlobal}'`);
    }
}
function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
