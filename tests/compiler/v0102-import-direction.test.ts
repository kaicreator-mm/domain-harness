import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const dirs = { contracts:'packages/contracts/src', microkernel:'packages/microkernel/src', hostNode:'packages/host-node/src', build:'tooling/build/src' } as const;
type P = keyof typeof dirs;
const names = { contracts:'@kaicreator/domain-harness-contracts', microkernel:'@kaicreator/domain-harness-microkernel', hostNode:'@kaicreator/domain-harness-host-node', build:'@kaicreator/domain-harness-build' } as const;
function files(dir: string): string[] {
  const out: string[] = [];
  const walk = (path: string) => {
    for (const ent of readdirSync(path, { withFileTypes:true })) {
      const next = join(path,ent.name);
      if(ent.isDirectory()) walk(next);
      else if(ent.name.endsWith('.ts')) out.push(next);
    }
  };
  walk(dir); return out.sort();
}
test('T00: no forbidden runtime→BUILD or Microkernel→Host edges; no package graph cycles', () => {
  const edges = new Map<P, Set<P>>();
  for(const [p,dir] of Object.entries(dirs) as [P,string][]) {
    const links=new Set<P>();
    for(const file of files(join(ROOT,dir))) {
      const source=readFileSync(file,'utf8');
      for(const m of source.matchAll(/(?:from\s*|import\s*\()\s*['"]([^'"]+)['"]/gu)) {
        const spec=m[1]!;
        for(const [q,prefix] of Object.entries(names) as [P,string][]) {
          if(spec===prefix || spec.startsWith(prefix+'/')) links.add(q);
        }
        if(p==='contracts') assert.doesNotMatch(spec, /^@kaicreator\/domain-harness(?:-compiler)?(?:\/|$)/u);
      }
    }
    edges.set(p,links);
  }
  assert.equal(edges.get('contracts')!.size,0);
  assert.equal(edges.get('microkernel')!.has('hostNode'),false);
  assert.equal(edges.get('microkernel')!.has('build'),false);
  assert.equal(edges.get('build')!.has('microkernel'),false);
  assert.equal(edges.get('build')!.has('hostNode'),false);
  const seen=new Set<P>(),stack=new Set<P>();
  const walk=(p:P):void=>{
    assert.equal(stack.has(p),false,'cycle at '+p);
    if(seen.has(p))return;
    stack.add(p);
    for(const q of edges.get(p)!)walk(q);
    stack.delete(p);seen.add(p);
  };
  for(const p of Object.keys(dirs) as P[])walk(p);
});