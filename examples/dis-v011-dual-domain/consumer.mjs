/**
 * D3 (#1532) — dual-domain (tally-engineering + downloads) source-locked
 * consumer qualification. Narrow projection over EXACT, unchanged source
 * blobs from kaicreator-mm/tally and kaicreator-mm/xDownload. Mode ported
 * from the #1497 cross-project consumer; this demo declares exactly two
 * consumers, four pinned sources and four selected Functions.
 *
 * Every snapshot is verified byte-for-byte against its originating Git Blob
 * SHA (git hash-object grammar) before any import, Element mapping or
 * Function binding is allowed. Direct invocation of the declared
 * external-effect Function is refused before the runtime can call it.
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const deny = (code) => { const e = new Error(code); e.code = code; throw e; };

export const PROJECTS = Object.freeze({
  tally: { repository: 'kaicreator-mm/tally', commit: 'e988321439f65b55936a691c02250b6d62a29409' },
  xdownload: { repository: 'kaicreator-mm/xDownload', commit: 'e904f08c478b15147b1c07fbe53c610d2d81851f' },
});

export const PINNED = Object.freeze({
  'tally/business.mjs': {
    repository: 'kaicreator-mm/tally',
    originalPath: 'packages/tally-engineering-business/src/index.mjs',
    gitBlob: '54015fb63ffb13b4f4e562f660d2172098b5f7f4',
  },
  'tally/release-readiness.mjs': {
    repository: 'kaicreator-mm/tally',
    originalPath: 'packages/tally-engineering-business/src/release-readiness.mjs',
    gitBlob: '2d4d6e7462156e4466192a0ed3207ac76fd288e1',
  },
  'xdownload/business-download.mjs': {
    repository: 'kaicreator-mm/xDownload',
    originalPath: 'packages/download-domain-app/src/business/business-download.mjs',
    gitBlob: 'a7dba9a896de0b84fc6d54093563adca2ccbcdfc',
  },
  'xdownload/capability-acquisition-stub.mjs': {
    repository: 'kaicreator-mm/xDownload',
    originalPath: 'packages/download-domain-app/src/business/capability-acquisition-stub.mjs',
    gitBlob: '2bfa722f88abade392b33964820ea178c072ef39',
  },
});

const KINDS = new Set(['rule', 'knowledge', 'stateful', 'external-effect']);

/** The exact `git hash-object` blob grammar over raw file bytes. */
export const gitBlobSha = (buffer) => createHash('sha1').update(Buffer.concat([
  Buffer.from('blob ' + buffer.length + '\0'), buffer,
])).digest('hex');

const clone = (value) => structuredClone(value);

function freeze(value) {
  if (value !== null && typeof value === 'object') {
    for (const x of Object.values(value)) freeze(x);
    Object.freeze(value);
  }
  return value;
}

async function defaultReadSnapshot(file) {
  if (!PINNED[file] || file.includes('..')) deny('DIS_SOURCE_NOT_PINNED');
  const url = new URL('./snapshots/' + file, import.meta.url);
  return await readFile(fileURLToPath(url));
}

/**
 * Qualify the dual-domain declaration against the pinned sources. The
 * optional `hooks.readSnapshot` exists ONLY so a negative test can feed
 * tampered bytes through this exact verification path; the default reader
 * reads the on-disk snapshot files.
 */
export async function qualifyProjectConsumers(declaration, hooks = {}) {
  const readSnapshot = hooks.readSnapshot ?? defaultReadSnapshot;
  if (declaration?.schema !== 'dis.v0.11.dual-domain-demo/1') deny('DIS_CONSUMER_SCHEMA');
  if (!Array.isArray(declaration.consumers) || declaration.consumers.length !== 2) deny('DIS_CONSUMERS_INCOMPLETE');
  const manifest = clone(declaration), modules = new Map(), functions = new Map(), elements = new Map(), owners = new Set(), verified = [];
  for (const project of manifest.consumers) {
    if (owners.has(project.id)) deny('DIS_DUP_CONSUMER');
    owners.add(project.id);
    const pinnedProject = PROJECTS[project.id];
    if (!pinnedProject || project.repository !== pinnedProject.repository ||
        project.sourceCommit !== pinnedProject.commit || !project.domainId) deny('DIS_CONSUMER_IDENTITY');
    for (const entry of project.sources) {
      const origin = PINNED[entry.file];
      if (!origin || origin.gitBlob !== entry.gitBlob) deny('DIS_SOURCE_NOT_PINNED');
      if (origin.repository !== project.repository || origin.originalPath !== entry.originalPath) deny('DIS_SOURCE_ORIGIN_INVALID');
      if (modules.has(entry.file)) deny('DIS_DUP_SOURCE');
      const bytes = await readSnapshot(entry.file);
      if (gitBlobSha(bytes) !== entry.gitBlob) deny('DIS_SOURCE_BYTES_DRIFT');
      const moduleUrl = new URL('./snapshots/' + entry.file, import.meta.url);
      modules.set(entry.file, await import(moduleUrl.href));
      verified.push(Object.freeze({ project: project.id, file: entry.file, gitBlob: entry.gitBlob }));
    }
    for (const el of project.elements) {
      if (elements.has(el.id)) deny('DIS_DUP_ELEMENT');
      if (!el.description || !Array.isArray(el.functions) || !el.functions.length) deny('DIS_ELEMENT_INVALID');
      elements.set(el.id, { ...el, project: project.id });
      for (const fn of el.functions) {
        const id = el.id + '.' + fn.id;
        if (functions.has(id)) deny('DIS_DUP_FUNCTION');
        if (!KINDS.has(fn.implementation)) deny('DIS_IMPLEMENTATION_UNKNOWN');
        if (fn.effects !== 'none' && fn.implementation !== 'external-effect') deny('DIS_EFFECT_CLASS_MISMATCH');
        if (fn.implementation === 'external-effect' && fn.effects !== 'non-idempotent') deny('DIS_EFFECT_CLASS_MISMATCH');
        if (!project.sources.some((x) => x.file === fn.source)) deny('DIS_FUNCTION_FOREIGN_SOURCE');
        const exposed = modules.get(fn.source)?.[fn.exportName];
        if (typeof exposed !== 'function') deny('DIS_FUNCTION_EXPORT_MISSING');
        functions.set(id, Object.freeze({ ...fn, id, owner: project.id }));
      }
    }
  }
  // Static dependency closure is checked BEFORE the coverage count: a
  // manifest whose declared dependsOn target is missing fails closed on the
  // dependency semantics, not on an aggregate count.
  const colors = new Map();
  const visit = (id) => {
    if (!elements.has(id)) deny('DIS_DEPENDENCY_MISSING');
    if (colors.get(id) === 1) deny('DIS_DEPENDENCY_CYCLE');
    if (colors.get(id) === 2) return;
    colors.set(id, 1);
    const element = elements.get(id);
    for (const dep of element.dependsOn || []) {
      if (!elements.has(dep)) deny('DIS_DEPENDENCY_MISSING');
      if (elements.get(dep)?.project !== element.project) deny('DIS_CROSS_PROJECT_DEPENDENCY');
      visit(dep);
    }
    colors.set(id, 2);
  };
  for (const id of elements.keys()) visit(id);
  if (owners.size !== 2 || verified.length !== 4 || functions.size !== 4) deny('DIS_COVERAGE_MISMATCH');
  const locked = freeze(manifest);
  const idOf = (id) => { const fn = functions.get(id); if (!fn) deny('DIS_FUNCTION_UNBOUND'); return fn; };
  return Object.freeze({
    declaration: locked, verified: Object.freeze(verified), functionIds: Object.freeze([...functions.keys()]),
    modules,
    describe: (id) => idOf(id),
    async invoke(id, ...args) {
      const f = idOf(id);
      if (f.implementation === 'external-effect') deny('DIS_EXTERNAL_EFFECT_KDP_REQUIRED');
      const impl = modules.get(f.source)[f.exportName];
      return f.implementation === 'stateful' ? new impl(...args) : await impl(...args);
    },
  });
}
