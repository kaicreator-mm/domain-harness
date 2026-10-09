// Hand-authored Genesis Kernel capability; never mints Host trust or executes effects.
export function link({graphDigest, packages, bindings}) {
  if (typeof graphDigest !== 'string' || !graphDigest.startsWith('sha256:') ||
      !Array.isArray(packages) || !Array.isArray(bindings)) throw Object.assign(new Error('link inputs'), {code:'E_LINK_INPUT'});
  return Object.freeze({graphDigest, packages:Object.freeze(packages.map(x=>Object.freeze({...x}))),
    bindings:Object.freeze(bindings.map(x=>Object.freeze({...x})))});
}
