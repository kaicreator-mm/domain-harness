# L2 Source Inventory - reproduction scripts

Companion of `L2_SOURCE_INVENTORY.md`. Pin: `f49c2a5f9ad79809959d1c5b6f6d8542c8d06f44`. Each script was run with `node` v24.21.0 from a scratch directory (not committed); `<worktree>` is the repository root at the pin. They use regular expressions (not an AST), take no dependencies and write nothing into the repository.

Commands not covered by a script:

```
git rev-parse HEAD && git status --short                       # pin, clean tree
npm pack <abs>/packages/domain-harness          --dry-run --json --ignore-scripts > pack-core.json
npm pack <abs>/packages/domain-harness-compiler --dry-run --json --ignore-scripts > pack-comp.json
git ls-files packages/domain-harness/dist | wc -l              # 1210 ; compiler: 112
git hash-object <payload file>                                  # blob ids quoted in the design doc
```

## imports.mjs

Import graph (`graph`), selected-path module reachability (`reach`), non-test package-subpath consumers (`consumers`). Usage: `node imports.mjs <worktree> graph|reach|consumers`.

<details><summary>source</summary>

```js
// Import-graph extractor for L2_SOURCE_INVENTORY. Usage: node imports.mjs <repoRoot> <mode>
// No dependencies; regex based (static import/export-from, dynamic import('lit'), require('lit')).
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.argv[2]);
const mode = process.argv[3] || 'graph';
const rel = (p) => path.relative(root, p).split(path.sep).join('/');

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === 'dist' || e.name === '.git') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}

const SRC_RE = /\.(ts|mts|mjs|js|cjs)$/;
function stripComments(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');
}
function specs(file) {
  const s = stripComments(fs.readFileSync(file, 'utf8'));
  const out = new Set();
  const res = [
    /\bimport\s+(?:type\s+)?[^'"`;]*?\sfrom\s*['"]([^'"]+)['"]/g,
    /\bexport\s+(?:type\s+)?[^'"`;]*?\sfrom\s*['"]([^'"]+)['"]/g,
    /\bimport\s*['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const re of res) for (const m of s.matchAll(re)) out.add(m[1]);
  return [...out].sort();
}
function resolveRel(from, spec) {
  const base = path.resolve(path.dirname(from), spec);
  const cands = [base];
  const noExt = base.replace(/\.(m?js|cjs)$/, '');
  if (noExt !== base) cands.push(noExt + '.ts', noExt + '.mts', noExt + '.d.mts', noExt + '.d.ts');
  cands.push(base + '.ts', base + '.mjs', base + '.js', path.join(base, 'index.ts'), path.join(base, 'index.js'));
  for (const c of cands) if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  return null;
}
const PKG_DIRS = {
  '@kaicreator/domain-harness-compiler': 'packages/domain-harness-compiler',
  '@kaicreator/domain-harness': 'packages/domain-harness',
  '@kaicreator/domain-harness-node': 'packages/domain-harness-node',
  '@kaicreator/domain-harness-expo': 'packages/domain-harness-expo',
};
function classify(file, spec) {
  if (spec.startsWith('.')) {
    const r = resolveRel(file, spec);
    return { kind: 'rel', target: r ? rel(r) : `UNRESOLVED(${spec})`, spec };
  }
  if (spec.startsWith('node:')) return { kind: 'node', spec };
  for (const k of Object.keys(PKG_DIRS).sort((a, b) => b.length - a.length))
    if (spec === k || spec.startsWith(k + '/')) return { kind: 'pkg', spec };
  return { kind: 'ext', spec };
}

if (mode === 'graph') {
  const dirs = [
    'packages/domain-harness-compiler/src/qualified-package/v10build',
    'packages/domain-harness-compiler/src/qualified-package/v10meta',
    'packages/domain-harness-compiler/src/qualified-package/v10shadow',
    'packages/domain-harness-compiler/src/qualified-package/v09',
    'packages/domain-harness-compiler/src/qualified-package/payload',
    'packages/domain-harness/src/host-v8',
  ];
  const files = dirs.flatMap((d) => walk(path.join(root, d)).filter((f) => SRC_RE.test(f) && !f.endsWith('.d.mts')));
  files.push(path.join(root, 'packages/domain-harness/src/public-v8/contracts.ts'));
  for (const f of files.sort()) {
    const c = specs(f).map((s) => classify(f, s));
    const relT = c.filter((x) => x.kind === 'rel').map((x) => x.target);
    const pkg = c.filter((x) => x.kind === 'pkg').map((x) => x.spec);
    const node = c.filter((x) => x.kind === 'node').map((x) => x.spec);
    const ext = c.filter((x) => x.kind === 'ext').map((x) => x.spec);
    console.log(JSON.stringify({ file: rel(f), rel: relT, pkg, node, ext }));
  }
} else if (mode === 'reach') {
  // Reachability of host-v8 from the v0.10 selected path.
  const seeds = [];
  for (const f of walk(path.join(root, 'packages/domain-harness-compiler/src/qualified-package/v10build')).filter((f) => /\.ts$/.test(f))) seeds.push(f);
  for (const f of walk(path.join(root, 'examples/v010-clean-consumer')).filter((f) => SRC_RE.test(f))) seeds.push(f);
  for (const f of walk(path.join(root, 'packages/domain-harness/src/host-v8')).filter((f) => /v010-/.test(path.basename(f)))) seeds.push(f);
  // package-subpath specifiers mapped to source entrypoints
  const subpathMap = {
    '@kaicreator/domain-harness/v8/host': 'packages/domain-harness/src/host-v8/index.ts',
    '@kaicreator/domain-harness/v8': 'packages/domain-harness/src/public-v8/index.ts',
    '@kaicreator/domain-harness/v8/dac': 'packages/domain-harness/src/public-v8/dac.ts',
    '@kaicreator/domain-harness/v9': 'packages/domain-harness/src/public-v9/index.ts',
    '@kaicreator/domain-harness/v9/deployment': 'packages/domain-harness/src/public-v9/deployment.ts',
    '@kaicreator/domain-harness': 'packages/domain-harness/src/index.ts',
  };
  const seen = new Map(); // file -> via
  const q = [];
  for (const s of seeds) { seen.set(s, 'SEED'); q.push(s); }
  while (q.length) {
    const f = q.shift();
    for (const sp of specs(f)) {
      let t = null;
      if (sp.startsWith('.')) t = resolveRel(f, sp);
      else if (subpathMap[sp]) t = path.join(root, subpathMap[sp]);
      if (t && SRC_RE.test(t) && !seen.has(t)) { seen.set(t, rel(f)); q.push(t); }
    }
  }
  const hostFiles = walk(path.join(root, 'packages/domain-harness/src/host-v8')).sort();
  const out = hostFiles.map((f) => ({ file: rel(f), reached: seen.has(f), via: seen.get(f) ?? null }));
  for (const o of out) console.log(JSON.stringify(o));
  console.error('SEEDS=' + seeds.length + ' REACHED_TOTAL=' + seen.size);
  if (process.argv[4] === 'all') for (const [k, v] of seen) console.log('ALL ' + rel(k) + ' <- ' + v);
} else if (mode === 'consumers') {
  const files = ['examples', 'extensions', 'packages', 'scripts']
    .flatMap((d) => walk(path.join(root, d)))
    .filter((f) => /\.(ts|mts|mjs|js|cjs)$/.test(f))
    .filter((f) => !/\/tests?\//.test(rel(f)) && !/\.test\./.test(f));
  for (const f of files.sort()) {
    const imp = specs(f).filter((x) => x.startsWith('@kaicreator/'));
    const raw = fs.readFileSync(f, 'utf8');
    const txt = [...new Set([...raw.matchAll(/@kaicreator\/domain-harness(?:-compiler)?(?:\/[A-Za-z0-9_\-./]+)?/g)].map((m) => m[0]))].filter((x) => !imp.includes(x)).sort();
    if (imp.length || txt.length) console.log(JSON.stringify({ file: rel(f), imports: imp, textOnly: txt }));
  }
}
```

</details>

## sym.mjs

Symbol-level selected-path usage of every `host-v8` export. Usage: `node sym.mjs <worktree>`.

<details><summary>source</summary>

```js
import fs from 'node:fs'; import path from 'node:path';
const root = path.resolve(process.argv[2]);
const rel = (p)=>path.relative(root,p).split(path.sep).join('/');
function walk(d,o=[]){ if(!fs.existsSync(d))return o; for(const e of fs.readdirSync(d,{withFileTypes:true})){ if(['node_modules','dist','.git'].includes(e.name))continue; const p=path.join(d,e.name); e.isDirectory()?walk(p,o):o.push(p);} return o;}
const hostDir = path.join(root,'packages/domain-harness/src/host-v8');
const hostFiles = walk(hostDir).filter(f=>/\.ts$/.test(f)&&!f.endsWith('index.ts'));
const exportsOf = (f)=>{ const s=fs.readFileSync(f,'utf8'); const n=new Set();
  for(const m of s.matchAll(/^export\s+(?:declare\s+)?(?:abstract\s+)?(?:const|let|function|async function|class|interface|type|enum)\s+([A-Za-z0-9_$]+)/gm)) n.add(m[1]);
  for(const m of s.matchAll(/^export\s*\{([^}]*)\}/gm)) for(const x of m[1].split(',')){ const t=x.trim().split(/\s+as\s+/).pop(); if(t) n.add(t.replace(/^type\s+/,'')); }
  return [...n]; };
// "Selected-path consumer" set: v10build, examples/v010-clean-consumer, examples/v0101-agent-improvement, extensions
const consumers = [
  ...walk(path.join(root,'packages/domain-harness-compiler/src/qualified-package/v10build')).filter(f=>/\.ts$/.test(f)),
  ...walk(path.join(root,'examples/v010-clean-consumer')).filter(f=>/\.(mjs|ts)$/.test(f)),
  ...walk(path.join(root,'examples/v0101-agent-improvement')).filter(f=>/\.(mjs|ts)$/.test(f)),
  ...walk(path.join(root,'extensions')).filter(f=>/\.(mjs|ts)$/.test(f)),
];
const strip=(s)=>s.replace(/\/\*[\s\S]*?\*\//g,'').replace(/(^|[^:'"`\\])\/\/[^\n]*/g,'$1');
const cs = consumers.map(f=>({f:rel(f), s:strip(fs.readFileSync(f,'utf8'))}));
for(const f of hostFiles){
  const names = exportsOf(f); const used={};
  for(const n of names){ const re=new RegExp('\\b'+n.replace(/\$/g,'\\$')+'\\b'); const hits=cs.filter(c=>re.test(c.s)).map(c=>c.f); if(hits.length) used[n]=hits; }
  console.log(JSON.stringify({file:rel(f), exports:names.length, usedBySelected:used}));
}
```

</details>

## hostimporters.mjs

Which tests import which `host-v8` file (relative path or `@kaicreator/domain-harness/v8/host`). Usage: `node hostimporters.mjs <worktree>`.

<details><summary>source</summary>

```js
import fs from 'node:fs'; import path from 'node:path';
const root = path.resolve(process.argv[2]);
const rel = (p)=>path.relative(root,p).split(path.sep).join('/');
function walk(d,o=[]){ if(!fs.existsSync(d))return o; for(const e of fs.readdirSync(d,{withFileTypes:true})){ if(['node_modules','dist','.git'].includes(e.name))continue; const p=path.join(d,e.name); e.isDirectory()?walk(p,o):o.push(p);} return o;}
const strip=(s)=>s.replace(/\/\*[\s\S]*?\*\//g,'').replace(/(^|[^:'"`\\])\/\/[^\n]*/g,'$1');
const specs=(f)=>{const s=strip(fs.readFileSync(f,'utf8'));const o=new Set();for(const re of [/\bfrom\s*['"]([^'"]+)['"]/g,/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,/\bimport\s*['"]([^'"]+)['"]/g]) for(const m of s.matchAll(re)) o.add(m[1]); return [...o];};
function resolveRel(from, spec){ const base=path.resolve(path.dirname(from),spec); const noExt=base.replace(/\.(m?js|cjs)$/,''); for(const c of [base,noExt+'.ts',noExt+'.mts',base+'.ts',path.join(base,'index.ts')]) if(fs.existsSync(c)&&fs.statSync(c).isFile()) return c; return null; }
const files = ['tests','packages/domain-harness/tests','packages/domain-harness-compiler/tests','examples','extensions'].flatMap(d=>walk(path.join(root,d))).filter(f=>/\.(ts|mts|mjs)$/.test(f));
const res = {};
const bucket = (r)=> r.startsWith('tests/') ? 'root' : r.startsWith('packages/domain-harness/tests') ? 'core' : r.startsWith('packages/domain-harness-compiler/tests') ? 'compiler' : 'examples/ext';
for (const f of files) {
  for (const sp of specs(f)) {
    let target = null;
    if (sp.startsWith('.')) { const t = resolveRel(f, sp); if (t) target = rel(t); }
    else if (sp === '@kaicreator/domain-harness/v8/host') target = 'packages/domain-harness/src/host-v8/index.ts';
    if (target && /packages\/domain-harness\/src\/host-v8\//.test(target)) {
      const k = target.replace('packages/domain-harness/src/host-v8/','');
      res[k] ??= { root: new Set(), core: new Set(), compiler: new Set(), 'examples/ext': new Set() };
      res[k][bucket(rel(f))].add(rel(f));
    }
  }
}
for (const [k, v] of Object.entries(res).sort()) console.log(JSON.stringify({ target: k, root: v.root.size, core: v.core.size, compiler: v.compiler.size, examplesExt: v['examples/ext'].size, rootList: [...v.root].sort().map(x=>x.replace('tests/','')) }));
```

</details>

## closure.mjs

Transitive relative-import closure and external value imports from seed files. Usage: `node closure.mjs <worktree> <seed paths...>`.

<details><summary>source</summary>

```js
import fs from 'node:fs'; import path from 'node:path';
const root = path.resolve(process.argv[2]);
const seedsRel = process.argv.slice(3);
const rel = (p)=>path.relative(root,p).split(path.sep).join('/');
const strip=(s)=>s.replace(/\/\*[\s\S]*?\*\//g,'').replace(/(^|[^:'"`\\])\/\/[^\n]*/g,'$1');
const specs=(f)=>{const s=strip(fs.readFileSync(f,'utf8'));const o=new Set();
  for(const re of [/\bimport\s+(?!type\b)[^'"`;]*?\sfrom\s*['"]([^'"]+)['"]/g,/\bexport\s+(?!type\b)[^'"`;]*?\sfrom\s*['"]([^'"]+)['"]/g,/\bimport\s*['"]([^'"]+)['"]/g,/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g]) for(const m of s.matchAll(re)) o.add(m[1]); return [...o];};
function resolveRel(from, spec){ const base=path.resolve(path.dirname(from),spec); const noExt=base.replace(/\.(m?js|cjs)$/,''); for(const c of [base,noExt+'.ts',noExt+'.mts',base+'.ts',path.join(base,'index.ts')]) if(fs.existsSync(c)&&fs.statSync(c).isFile()) return c; return null; }
const seen=new Set(); const ext=new Set(); const q=seedsRel.map(s=>path.join(root,s));
for(const s of q) seen.add(s);
while(q.length){ const f=q.shift(); for(const sp of specs(f)){ if(sp.startsWith('.')){ const t=resolveRel(f,sp); if(t&&!seen.has(t)){seen.add(t);q.push(t);} } else if(!sp.startsWith('node:')) ext.add(sp);} }
console.log('files', seen.size);
const dirs={}; for(const f of seen){ const d=rel(f).split('/').slice(0,4).join('/'); dirs[d]=(dirs[d]||0)+1; }
console.log(JSON.stringify(dirs));
console.log('external (value imports, type-only imports excluded):', [...ext].join(', '));
```

</details>

## testpaths.mjs

Section 3.2 legacy-surface importers (`b`) and loose payload/v10 path references (`a`). Usage: `node testpaths.mjs <worktree> a|b`.

<details><summary>source</summary>

```js
import fs from 'node:fs'; import path from 'node:path';
const root = path.resolve(process.argv[2]);
const rel = (p)=>path.relative(root,p).split(path.sep).join('/');
function walk(d,o=[]){ if(!fs.existsSync(d))return o; for(const e of fs.readdirSync(d,{withFileTypes:true})){ if(['node_modules','dist','.git','.target'].includes(e.name))continue; const p=path.join(d,e.name); e.isDirectory()?walk(p,o):o.push(p);} return o;}
const SRC=/\.(ts|mts|mjs|js|cjs|tsx)$/;
const all = ['tests','packages','examples','extensions','scripts'].flatMap(d=>walk(path.join(root,d))).filter(f=>SRC.test(f));
const isTest = (r)=> /^tests\//.test(r) || /^packages\/[^/]+\/tests\//.test(r) || /\.test\./.test(r);
const tests = all.filter(f=>isTest(rel(f)));
const mode = process.argv[3];
const out = {};
if (mode === 'a') {
  // (a) references into compiler qualified-package payload / v09 / v10build by path text
  const re = /qualified-package\/(payload|v09|v10build|v10meta|v10shadow)\b[^'"`\s)]*/g;
  const bucket = {};
  for (const f of all) {
    const r = rel(f); const s = fs.readFileSync(f,'utf8'); const m = [...s.matchAll(re)];
    if (!m.length) continue;
    const area = isTest(r) ? 'TEST' : r.startsWith('packages/domain-harness-compiler/src/') ? 'COMPILER_SRC' : r.split('/')[0] + (r.startsWith('packages/') ? '/' + r.split('/')[1] : '') + '(non-test)';
    (bucket[area] ??= []).push({ file: r, occ: m.length, targets: [...new Set(m.map(x=>x[1]))] });
  }
  for (const [a, l] of Object.entries(bucket)) console.log(JSON.stringify({ area: a, files: l.length, occurrences: l.reduce((n,x)=>n+x.occ,0), byTarget: Object.fromEntries(['payload','v09','v10build','v10meta','v10shadow'].map(t=>[t,l.filter(x=>x.targets.includes(t)).length])), list: l.map(x=>x.file+' ('+x.occ+')') }));
} else if (mode === 'b') {
  const reSrc = /(?:src|\.\.)\/(public-v[0-9]+|legacy-v1|host-v9|recovery-v2|host-v8)(?:\/|['"`.])/g;
  const reRel = /\/(public-v[0-9]+|legacy-v1|host-v9|recovery-v2|host-v8)\//g;
  const rePkg = /@kaicreator\/domain-harness\/(v2|v3|v4|v7|v9|v8|workflow)(?:\/[a-z]+)?['"`]/g;
  const res = [];
  for (const f of tests) {
    const r = rel(f); const s = fs.readFileSync(f,'utf8');
    const t1 = [...s.matchAll(reRel)].map(m=>m[1]);
    const t2 = [...s.matchAll(rePkg)].map(m=>'pkg:'+m[1]);
    const rel2 = [...s.matchAll(/['"`](\.{1,2}\/[^'"`]*?)(public-v[0-9]+|legacy-v1|host-v9|recovery-v2|host-v8)(\/[^'"`]*)?['"`]/g)].map(m=>m[2]);
    const targets = [...new Set([...rel2, ...t2])];
    if (targets.length) res.push({ file: r, targets });
  }
  const by = {};
  for (const x of res) for (const t of x.targets) by[t] = (by[t] ?? 0) + 1;
  console.log(JSON.stringify({ files: res.length, byTarget: by }));
  for (const x of res) console.log('FILE ' + x.file + ' :: ' + x.targets.join(','));
}
```

</details>

## tpa2.mjs

Section 3.1 literal path references into `qualified-package/*`. Usage: `node tpa2.mjs <worktree> [list]`.

<details><summary>source</summary>

```js
import fs from 'node:fs'; import path from 'node:path';
const root = path.resolve(process.argv[2]);
const rel = (p)=>path.relative(root,p).split(path.sep).join('/');
function walk(d,o=[]){ if(!fs.existsSync(d))return o; for(const e of fs.readdirSync(d,{withFileTypes:true})){ if(['node_modules','dist','.git'].includes(e.name))continue; const p=path.join(d,e.name); e.isDirectory()?walk(p,o):o.push(p);} return o;}
const all = ['tests','packages','examples','extensions','scripts'].flatMap(d=>walk(path.join(root,d))).filter(f=>/\.(ts|mts|mjs|js|cjs)$/.test(f));
const isTest=(r)=>/^tests\//.test(r)||/^packages\/[^/]+\/tests\//.test(r);
const lit = (seg)=> new RegExp("['\"`][^'\"`\n]*qualified-package/"+seg+"[^'\"`\n]*['\"`]",'g');
const lit2 = (seg)=> new RegExp("['\"`]\.\.?/[^'\"`\n]*qualified-package/"+seg+"[^'\"`\n]*['\"`]",'g');
for (const seg of ['payload','v09/','v09','v10build','v10meta','v10shadow']) {
  const files=new Set(); let occ=0; const relFiles=new Set(); let relOcc=0;
  for (const f of all) { const r=rel(f); if(!isTest(r)) continue; const s=fs.readFileSync(f,'utf8'); const m=[...s.matchAll(lit(seg))]; if(m.length){files.add(r);occ+=m.length;} const m2=[...s.matchAll(lit2(seg))]; if(m2.length){relFiles.add(r);relOcc+=m2.length;} }
  console.log(JSON.stringify({seg, anyLiteralFiles:files.size, anyLiteralOcc:occ, relativeLiteralFiles:relFiles.size, relativeLiteralOcc:relOcc}));
  if (process.argv[3]==='list' && ['payload','v09','v10build'].includes(seg)) for (const r of [...files].sort()) console.log('  '+seg+' :: '+r);
}
```

</details>

## overlap.mjs

Section 3.3 owner-class overlap of test files. Usage: `node overlap.mjs <worktree> <out.jsonl>`.

<details><summary>source</summary>

```js
import fs from 'node:fs'; import path from 'node:path';
const root = path.resolve(process.argv[2]);
const rel = (p)=>path.relative(root,p).split(path.sep).join('/');
function walk(d,o=[]){ if(!fs.existsSync(d))return o; for(const e of fs.readdirSync(d,{withFileTypes:true})){ if(['node_modules','dist','.git'].includes(e.name))continue; const p=path.join(d,e.name); e.isDirectory()?walk(p,o):o.push(p);} return o;}
const all = ['tests','packages','examples','extensions'].flatMap(d=>walk(path.join(root,d))).filter(f=>/\.(ts|mts|mjs|js|cjs)$/.test(f));
const isTest=(r)=>/^tests\//.test(r)||/^packages\/[^/]+\/tests\//.test(r);
const classes = {
  K: /kernel-mechanism-v1/, S: /standard-sdk-v1/, ROUTER: /workflow-router/, SFEAT: /sfeature-[a-z-]+-v1/, FRAG: /durable-receipt-carrier-v1/, BMETA: /business-meta-feedback-v1/, ABI: /selected-abi/,
  V10BUILD_RT: /v10build\/(activation|import-hook|external-effect|deployment|guards|errors|known-error-codes|digest|index)/, V10BUILD_BUILD: /v10build\/(build|selected-closure|import-policy)/,
  V10META: /v10meta/, V10SHADOW: /v10shadow/, V10EVID: /v10evidence/,
  HOST_SEL: /host-v8\/(sqlite-cas-store|cas|v010-|durable-controls|errors)/, HOST_BARREL: /host-v8\/index/, HOST_RES: /host-v8\/(bootstrap|dispatcher|events|identity|hf20|kernel-gateway|tool-call-port|ux-transport)/, PUBV8: /public-v8/,
  COMPILER_OTHER: /domain-harness-compiler\/src\/(?!qualified-package\/(payload|v09\/|v10))/,
};
const rows = [];
for (const f of all) {
  const r = rel(f); if (!isTest(r)) continue;
  const s = fs.readFileSync(f,'utf8');
  const hit = []; for (const [k, re] of Object.entries(classes)) {
    // only count when appears inside a quoted path/specifier literal
    const lit = new RegExp("['\"`][^'\"`\\n]*" + re.source + "[^'\"`\\n]*['\"`]");
    if (lit.test(s)) hit.push(k);
  }
  if (hit.length) rows.push({ f: r, hit });
}
const count = {}; for (const r of rows) for (const h of r.hit) count[h] = (count[h]||0)+1;
console.log('test files touching any moved owner:', rows.length);
console.log(JSON.stringify(count));
// owner groups (task bundles)
const bundle = { K:'T-K', FRAG:'T-K', S:'T-S', ROUTER:'T-S', SFEAT:'T-S', BMETA:'T-S', ABI:'T-S', V10BUILD_RT:'T-MK', V10BUILD_BUILD:'T-BUILD', V10META:'T-HOST', V10SHADOW:'T-HOST', V10EVID:'T-HOST', HOST_SEL:'T-HOST', HOST_BARREL:'T-HOST', HOST_RES:'T-LEGACY', PUBV8:'T-LEGACY', COMPILER_OTHER:'T-LEGACY' };
const multi = rows.filter(r => new Set(r.hit.map(h=>bundle[h])).size > 1);
console.log('files touching >=2 task bundles:', multi.length);
const pair = {}; for (const r of multi) { const k=[...new Set(r.hit.map(h=>bundle[h]))].sort().join('+'); pair[k]=(pair[k]||0)+1; }
console.log(JSON.stringify(pair,null,1));
fs.writeFileSync(process.argv[3], rows.map(r=>JSON.stringify(r)).join('\n')+'\n');
```

</details>

## packsum.mjs

Section 4 summary of `npm pack --dry-run --json` output (`pack-core.json`, `pack-comp.json` in the working directory).

<details><summary>source</summary>

```js
import fs from 'node:fs';
for (const n of ['core','comp']) {
  const j = JSON.parse(fs.readFileSync(`pack-${n}.json`,'utf8'))[0];
  console.log(`== ${n}: ${j.name}@${j.version} files=${j.entryCount} size=${j.size} unpacked=${j.unpackedSize}`);
  const by = {}; for (const f of j.files) { const p = f.path.split('/'); const k = p.length>1 ? (p[0]==='dist'||p[0]==='src' ? p.slice(0,3).join('/') : p[0]) : p[0]; (by[k] ??= {n:0,b:0}); by[k].n++; by[k].b+=f.size; }
  if (n==='core') { const by2={}; for (const f of j.files) { const p=f.path.split('/'); const k = p[0]==='dist'? (p.length>2? 'dist/'+p[1] : 'dist/(root files)') : p[0]; by2[k]??={n:0,b:0}; by2[k].n++; by2[k].b+=f.size; } console.log(JSON.stringify(by2,null,0)); }
  else { const by2={}; for (const f of j.files) { const p=f.path.split('/'); const k = p.slice(0, p[0]==='dist'||p[0]==='src' ? Math.min(p.length-1,3) : 1).join('/')||p[0]; by2[k]??={n:0,b:0}; by2[k].n++; by2[k].b+=f.size; } console.log(JSON.stringify(by2,null,0)); }
  const top={}; for (const f of j.files){ const k=f.path.split('/')[0]; top[k]=(top[k]||0)+1;} console.log('TOP', JSON.stringify(top));
}
```

</details>

## cites.mjs

Citation checker (amendment): prints the cited line(s) for every `file:line[-line]` in a document. Usage: `node cites.mjs <document.md>`. Bare `:NNN` citations that follow a file mention were verified by hand.

<details><summary>source</summary>

```js
import fs from 'node:fs'; import path from 'node:path';
const root = 'C:/xDev/kAiCreator/domain-harness/dh-i1300-l2-claude';
const docFile = process.argv[2];
function walk(d,o=[]){ for(const e of fs.readdirSync(d,{withFileTypes:true})){ if(['node_modules','dist','.git','docs'].includes(e.name))continue; const p=path.join(d,e.name); e.isDirectory()?walk(p,o):o.push(p);} return o;}
const all = walk(root).map(p=>p.replace(/\\/g,'/'));
const byBase = {}; for (const p of all) (byBase[path.basename(p)] ??= []).push(p);
const text = fs.readFileSync(docFile,'utf8').split('\n');
const re = /([A-Za-z0-9_\-./]+\.(?:ts|mjs|md|yaml|json)):(\d+(?:-\d+)?(?:,\d+(?:-\d+)?)*)/g;
let n=0;
text.forEach((line, i) => {
  for (const m of line.matchAll(re)) {
    let f = m[1].replace(/^(C|H)\//, m=>m); let cands;
    if (f.startsWith('C/')) f = 'packages/domain-harness-compiler/src/qualified-package/' + f.slice(2);
    else if (f.startsWith('H/')) f = 'packages/domain-harness/src/' + f.slice(2);
    const full = root + '/' + f;
    if (fs.existsSync(full) && fs.statSync(full).isFile()) cands = [full];
    else cands = (byBase[path.basename(f)] ?? []).filter(p => p.endsWith(f.split('/').slice(-2).join('/')) || !f.includes('/'));
    if (!cands || cands.length === 0) { console.log(`DOC:${i+1} ${m[0]} UNRESOLVED`); n++; continue; }
    if (cands.length > 1) { const pref=cands.filter(p=>p.includes('/v10build/')); if(pref.length===1) cands=pref; }
    if (cands.length > 1) { console.log(`DOC:${i+1} ${m[0]} AMBIGUOUS ${cands.length}`); n++; continue; }
    const src = fs.readFileSync(cands[0],'utf8').split('\n');
    for (const part of m[2].split(',')) {
      const [a,b] = part.split('-').map(Number); const hi = b ?? a;
      const first = (src[a-1]??'<EOF>').trim().slice(0,90);
      const last = hi!==a ? (src[hi-1]??'<EOF>').trim().slice(0,60) : '';
      console.log(`DOC:${i+1} ${path.basename(cands[0])}:${part} | ${first}${last?' ... '+last:''}`); n++;
    }
  }
});
console.log('TOTAL', n);
```

</details>
