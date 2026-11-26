import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, basename, resolve, join, relative, sep, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { expectedClasses, expectedFunctions, expectedTypes, expectedSupport, expectedFamilies } from './sdk-capability-expectations.mjs';

export const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const sdk=join(root,'packages/domain-harness');
const skill=join(root,'.agents/skills/domain-harness-spec');
export const packedSkill='skills/domain-harness-spec';
const catalog='references/capabilities.md';
const families=['lifecycle','workflow','structured-data','query','database','expression','cli','semantic-interaction'];
const sorted=items=>[...items].sort();
const normalized=s=>s.replace(/\r\n/g,'\n');
const read=p=>normalized(readFileSync(p,'utf8'));
const within=(parent,path)=>{const r=relative(parent,path);return r!== '..'&&!r.startsWith('..'+sep)&&!isAbsolute(r);};
const format=ts.TypeFormatFlags.NoTruncation|ts.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope;
const own=(dir,node)=>within(dir,resolve(node.getSourceFile().fileName));
const mods=node=>ts.getCombinedModifierFlags(node);
const visible=node=>!(mods(node)&(ts.ModifierFlags.Private|ts.ModifierFlags.Protected))&&!ts.isPrivateIdentifier(node.name);
const memberName=symbol=>{
 const name=symbol.declarations?.[0]?.name;
 return name&&ts.isComputedPropertyName(name)?name.getText():symbol.name;
};
const canonical=s=>s.replace(/\s+/gu,' ').trim();
// Defaulted source parameters and emitted optional declarations accept the same arguments.
const signature=(checker,s)=>canonical(checker.signatureToString(s,undefined,format)).replace(/(\w+\?: [^,():]+?) \| undefined(?=[,)])/gu,'$1');
function makeProgram(entry) {
 const conf=ts.readConfigFile(join(sdk,'tsconfig.json'),ts.sys.readFile);
 assert.equal(conf.error,undefined);
 const options=ts.parseJsonConfigFileContent(conf.config,ts.sys,sdk).options;
 const program=ts.createProgram([entry],options);
 const checker=program.getTypeChecker();
 const module=checker.getSymbolAtLocation(program.getSourceFile(entry));
 assert.ok(module,'SDK_ROOT_MODULE');
 return {checker,module};
}
function accessFor(name,decl) {
 if(mods(decl)&ts.ModifierFlags.Abstract)return 'abstract';
 const ctor=decl.members.find(ts.isConstructorDeclaration);
 if(ctor&&(mods(ctor)&ts.ModifierFlags.Private))return 'factory';
 if(ctor&&(mods(ctor)&ts.ModifierFlags.Protected))return 'protected';
 return name==='NativeWorkflowContext'?'borrowed':'public';
}
function memberRows(checker,type,dir,location,scope,all=false){
 return checker.getPropertiesOfType(type).filter(s=>s.name!=='prototype'&&!(scope==='static'&&location.name?.getText()==='ClarificationElement'&&memberName(s)==='[clarificationData]')&&(s.declarations?.some(d=>own(dir,d)&&visible(d))||(scope==='contract'&&location.name?.getText()==='WorkflowRoutes'&&!s.declarations))).map(s=>{
   const d=s.declarations?.find(x=>own(dir,x)&&visible(x))??location;
   const mt=checker.getTypeOfSymbolAtLocation(s,d??location);
   const nonnull=checker.getNonNullableType(mt);
   const calls=nonnull.getCallSignatures().map(x=>signature(checker,x));
   const constructors=nonnull.getConstructSignatures().map(x=>signature(checker,x));
   const name=memberName(s);
   return {name,scope,kind:ts.isMethodDeclaration(d)||ts.isMethodSignature(d)?'method':calls.length?'callback':constructors.length?'constructor-value':'property',
     readonly:!!(mods(d)&ts.ModifierFlags.Readonly)||(scope==='contract'&&location.name?.getText()==='WorkflowRoutes'),optional:!!(s.flags&ts.SymbolFlags.Optional),
     signature:canonical(checker.typeToString(mt,d,format)),calls,constructors,
     ...(all?{location:basename(d.getSourceFile().fileName).replace(/\.d\.ts$|\.ts$/u,'.d.ts')}:{} )};
 }).sort((a,b)=>a.name.localeCompare(b.name,'en'));
}
export function inventory(entry=join(sdk,'src/index.ts'),{requireTags=true}={}) {
 const {checker,module}=makeProgram(entry),dir=dirname(entry),rows=[];
 for(const a of checker.getExportsOfModule(module)){
   const s=a.flags&ts.SymbolFlags.Alias?checker.getAliasedSymbol(a):a;
   const d=s.valueDeclaration??s.declarations?.[0];
   assert.ok(d&&own(dir,d),'SDK_EXTERNAL_OR_MISSING_EXPORT:'+a.name);
   const tags=s.getJsDocTags(checker),tag=n=>tags.find(t=>t.name===n)?.text?.map(x=>x.text).join('');
   const isClass=ts.isClassDeclaration(d),isFunction=ts.isFunctionDeclaration(d),isType=ts.isTypeAliasDeclaration(d)||ts.isInterfaceDeclaration(d);
   assert.ok(isClass||isFunction||isType,'SDK_UNKNOWN_SYMBOL_KIND:'+a.name);
   const kind=tag('dhKind'),family=tag('dhCapability'),purpose=canonical(ts.displayPartsToString(s.getDocumentationComment(checker)));
   if(requireTags){
    assert.equal(tags.filter(t=>t.name==='dhKind').length,1,'SDK_KIND_TAG:'+a.name);
    assert.equal(tags.filter(t=>t.name==='dhCapability').length,1,'SDK_FAMILY_TAG:'+a.name);
    assert.ok(families.includes(family)&&purpose,'SDK_MISSING_CAPABILITY_DESCRIPTION:'+a.name);
   }
   const row={name:a.name,kind:kind??'',family:family??'',purpose,form:isClass?'class':isFunction?'function':'type',file:basename(d.getSourceFile().fileName).replace(/\.d\.ts$|\.ts$/u,'.d.ts'),members:[],signatures:[]};
   if(isClass){
    row.access=accessFor(a.name,d);
    const stat=checker.getTypeOfSymbolAtLocation(s,d);
    row.signatures=row.access==='factory'?[]:stat.getConstructSignatures().map(x=>signature(checker,x));
    row.members=[...memberRows(checker,checker.getDeclaredTypeOfSymbol(s),dir,d,'instance',true),...memberRows(checker,stat,dir,d,'static',true)];
   }else if(isFunction){
    row.signatures=checker.getTypeOfSymbolAtLocation(s,d).getCallSignatures().map(x=>signature(checker,x));
   }else{
    const t=checker.getDeclaredTypeOfSymbol(s);
    row.members=memberRows(checker,t,dir,d,'contract',true);
    row.signatures=t.getCallSignatures().map(x=>signature(checker,x));
    // The declaration is the authoritative type definition. Preserve the actual name,
    // generic constraints and location; data members need no separate tutorial.
    row.definition=canonical(ts.createPrinter({removeComments:true}).printNode(ts.EmitHint.Unspecified,d,d.getSourceFile()).replace(/^export\s+(?:declare\s+)?/u,'').replace(/;$/u,''));
   }
   rows.push(row);
 }
 return rows.sort((a,b)=>a.name.localeCompare(b.name,'en'));
}
export function verifyInventory(rows,{requireTags=true}={}){
 const by=new Map(rows.map(r=>[r.name,r]));
 assert.equal(by.size,rows.length,'SDK_DUPLICATE_EXPORT');
 assert.deepEqual(sorted(by.keys()),sorted([...Object.keys(expectedClasses),...expectedFunctions,...expectedTypes]),'SDK_ROOT_EXPECTATION');
 const partition=Object.entries(expectedFamilies).flatMap(([family,names])=>names.map(name=>[name,family]));
 assert.equal(new Set(partition.map(x=>x[0])).size,partition.length,'SDK_FAMILY_PARTITION_DUPLICATE');
 assert.deepEqual(sorted(partition.map(x=>x[0])),sorted(by.keys()),'SDK_FAMILY_PARTITION');
 if(requireTags)for(const [name,family] of partition)assert.equal(by.get(name).family,family,'SDK_WRONG_FAMILY:'+name);
 for(const [name,[kind,access,...members]] of Object.entries(expectedClasses)){
   const r=by.get(name);assert.equal(r.form,'class');if(requireTags)assert.equal(r.kind,kind,'SDK_CLASS_KIND:'+name);
   assert.equal(r.access,access,'SDK_ACQUISITION:'+name);
   // Static expected members are explicit dot-prefixed entries (future factory).
   assert.deepEqual(sorted(r.members.map(m=>m.scope==='static'?'.'+m.name:m.name)),sorted(members),'SDK_CLASS_MEMBERS:'+name);
 }
 for(const name of expectedFunctions){const r=by.get(name);assert.equal(r.form,'function');assert.ok(r.signatures.length);if(requireTags)assert.equal(r.kind,'function');}
 for(const name of expectedTypes){const r=by.get(name);assert.equal(r.form,'type');if(requireTags)assert.equal(r.kind,'type');}
 for(const [name,members] of Object.entries(expectedSupport)){
   const r=by.get(name);assert.deepEqual(sorted(r.members.map(m=>m.name)),sorted(members),'SDK_SUPPORT_MEMBERS:'+name);
 }
}
function comparable(rows){
 // Types' declaration text can differ in emitted whitespace/comments. All signatures,
 // member shapes and definitions are checked in their actual declared form; constructor
 // access and signatures are independently compared, not inferred from runtime reflection.
 return rows.map(({kind,family,purpose,...r})=>{void kind;void family;void purpose;return r;});
}
export function compareDeclarations(source,decl){
 verifyInventory(source);verifyInventory(decl,{requireTags:false});
 assert.deepEqual(comparable(decl),comparable(source),'SDK_DECLARATION_SHAPE_MISMATCH');
}
const escapeCode=s=>String(s).replaceAll('`','\\`').replaceAll('|','\\|');
function render(rows){
 verifyInventory(rows);
 const out=['# SDK 能力及成员目录','','由实际根声明、源码文档分类及独立公开合同生成；不是 Runtime registry。包根 import，签名位置为安装包 dist/。按场景读 [指南](../SKILL.md)，领域规则和权限仍由应用负责。','','成员范围：列出 DH 声明拥有的公开构造、静态/实例成员及支持合同。外部继承的 JavaScript Error/Node API（如 name/message/stack 或平台静态方法）是外部合同，不计入 DH 自有能力；如需使用请查相应平台声明。符号成员使用源码可读写法（如 [Symbol.asyncDispose]），不把编译器生成的内部 __@ 名称当作公开 API。不要用反射出来的全部继承成员替代声明目录。',''];
 for(const family of families){
   out.push('## '+family,'','[适用场景、限制与示例](capabilities/'+family+'.md)','');
   for(const r of rows.filter(x=>x.family===family)){
     out.push('### '+r.name,'','- 分类：`'+r.kind+'`；声明：`dist/'+r.file+'`','- 职责：'+r.purpose);
     if(r.access)out.push('- 获取方式：'+({public:'public constructor / new',abstract:'abstract contract / 不可直接 new',borrowed:'SDK 回调借用 / 不自行构造',factory:'仅 factory / 不可直接 new',protected:'protected / 不可直接 new'}[r.access]));
     for(const s of r.signatures)out.push('- '+(r.form==='class'?'构造声明':'调用签名')+'：`'+escapeCode(s)+'`');
     if(r.definition)out.push('- 类型声明：`'+escapeCode(r.definition)+'`');
     for(const m of r.members)out.push('- `'+r.name+(m.scope==='static'?'.':'#')+m.name+'` · '+m.scope+' '+m.kind+(m.readonly?' readonly':'')+(m.optional?' optional':'')+'：`'+escapeCode(m.signature)+'`'+(m.calls.length?'；调用：'+m.calls.map(s=>'`'+escapeCode(s)+'`').join(' / '):'')+(m.constructors.length?'；构造：'+m.constructors.map(s=>'`'+escapeCode(s)+'`').join(' / '):''));
     out.push('');
   }
 }
 return out.join('\n');
}
export function verifyScenarioRefs(rows,documents){
 const known=new Map(rows.map(r=>[r.name,r]));
 for(const [name,text] of documents){
  for(const line of text.split('\n').filter(l=>l.startsWith('API: '))){
   for(const ref of line.slice(5).trim().split(/\s+/u))assert.ok(known.has(ref),'SDK_SCENARIO_ROOT:'+name+':'+ref);
  }
  for(const m of text.matchAll(/`([A-Z][A-Za-z0-9_]*)([.#])(\[Symbol\.asyncDispose\]|[A-Za-z][A-Za-z0-9_]*)`/gu)){
   const [,symbol,separator,member]=m,r=known.get(symbol);
   assert.ok(r,'SDK_SCENARIO_SYMBOL:'+name+':'+symbol);
   if(member==='constructor'){assert.equal(separator,'.');assert.equal(r.access,'public','SDK_SCENARIO_CONSTRUCTOR:'+symbol);continue;}
   assert.ok(r.members.some(x=>x.name===member&&(separator==='.'?x.scope==='static':x.scope!=='static')),'SDK_SCENARIO_MEMBER:'+name+':'+m[0]);
  }
 }
}
function files(dir){
 return readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(join(dir,e.name)):e.isFile()?[join(dir,e.name)]:[]);
}
const relativeLinks=text=>[...text.matchAll(/\]\(([^)\s]+)\)/gu)].map(x=>x[1]).filter(x=>!/^https?:|^mailto:/iu.test(x));
function anchorOf(heading){return heading.trim().toLowerCase().replace(/[^\p{L}\p{N}\p{M}_ -]/gu,'').replaceAll(' ','-');}
export function verifyLocalLinks(dir){
 for(const path of files(dir).filter(p=>p.endsWith('.md'))){
  for(const ref of relativeLinks(read(path))){
   const [target,anchor]=ref.split('#'),dest=target?resolve(dirname(path),decodeURIComponent(target)):path;
   assert.ok(within(dir,dest)&&existsSync(dest),'SDK_LOCAL_LINK:'+relative(dir,path)+':'+ref);
   if(anchor&&dest.endsWith('.md')){
    const anchors=read(dest).split('\n').filter(l=>/^#+ /u.test(l)).map(l=>anchorOf(l.replace(/^#+ /u,'')));
    assert.ok(anchors.includes(decodeURIComponent(anchor)),'SDK_LOCAL_ANCHOR:'+relative(dir,path)+':'+ref);
   }
  }
 }
}
function projection(out){
 const docs=join(root,'docs/specs/domain-harness');
 const history=join(root,'docs/engineering/DomainHarness_v0.11.0_v0.11.1_NATIVE_REGRESSION_CROSSWALK.md');
 const map=new Map();
 for(const p of files(skill))map.set(p,join(out,relative(skill,p)));
 for(const p of files(docs))map.set(p,join(out,'references/specifications',relative(docs,p)));
 map.set(history,join(out,'references/history',basename(history)));
 const result=new Map();
 for(const [src,dest] of map){
  const text=read(src);
  const body=src.endsWith('.md')?text.replace(/\]\(([^)\s]+)\)/gu,(match,ref)=>{
   if(/^https?:|^mailto:|^#/iu.test(ref))return match;
   const [target,anchor]=ref.split('#'),next=map.get(resolve(dirname(src),target));
   assert.ok(next,'SDK_UNMAPPED_LOCAL_REFERENCE:'+relative(root,src)+':'+ref);
   return ']('+relative(dirname(dest),next).split(sep).join('/')+(anchor?'#'+anchor:'')+')';
  }):text;
  result.set(dest,body);
 }
 return result;
}
export function verifyPackedSkill(installed,expectedDir=join(sdk,packedSkill)){
 const dir=join(installed,packedSkill);
 assert.ok(existsSync(join(dir,'SKILL.md')),'SDK_PACKED_SKILL_MISSING');
 const expected=sorted(files(expectedDir).map(p=>relative(expectedDir,p)));
 assert.deepEqual(sorted(files(dir).map(p=>relative(dir,p))),expected,'SDK_PACKED_SKILL_FILE_SET');
 for(const p of expected)assert.deepEqual(readFileSync(join(dir,p)),readFileSync(join(expectedDir,p)),'SDK_PACKED_SKILL_BYTES:'+p);
 verifyLocalLinks(dir);
 compareDeclarations(inventory(),inventory(join(installed,'dist/index.d.ts'),{requireTags:false}));
 return expected.length;
}
function main(){
 const mode=process.argv[2];
 assert.ok(['--write','--check','--pack'].includes(mode),'SDK_CATALOG_MODE');
 const rows=inventory(),generated=render(rows),path=join(skill,catalog);
 const guides=files(join(skill,'references/capabilities')).map(p=>[relative(skill,p),read(p)]);
 verifyScenarioRefs(rows,guides);
 if(mode==='--write')writeFileSync(path,generated);
 else assert.equal(read(path),generated,'SDK_STALE_CAPABILITY_CATALOG');
 if(mode==='--pack'){
  compareDeclarations(rows,inventory(join(sdk,'dist/index.d.ts'),{requireTags:false}));
  const out=join(sdk,packedSkill),map=projection(out);
  rmSync(out,{recursive:true,force:true});
  for(const [dest,body] of map){mkdirSync(dirname(dest),{recursive:true});writeFileSync(dest,body);}
  verifyLocalLinks(out);
 }
 console.log(JSON.stringify({status:'SDK_CAPABILITY_'+mode.slice(2).toUpperCase()+'_PASS',values:rows.filter(r=>r.form!=='type').length,types:rows.filter(r=>r.form==='type').length}));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main();
