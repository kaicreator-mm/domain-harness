import { types } from 'node:util';
import type { StandardJsonValue as J } from './standard-files.js';
export type Obj = Readonly<Record<string,J>>;
export const invalid = (code = 'MODEL_INVALID_JSON'): never => { throw Error(code); };
export function object(v: unknown): Obj {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return invalid();
  return v as Obj;
}
export function array(v: unknown): readonly J[] {
  if (!Array.isArray(v)) return invalid();
  return v as readonly J[];
}
export function str(v: unknown, max = 1048576): string {
  return typeof v === 'string' && v.length <= max && Buffer.byteLength(v) <= max ? v : invalid();
}
const unsafe = (k: string) => ['__proto__','constructor','prototype'].includes(k);
/** 在构造对象前检测重复键、有界深度、项数及 UTF-8；不使用通用 YAML 语法。 */
export function parseJson(text: string, max: number): J {
  if (Buffer.byteLength(text) > max) return invalid('MODEL_BYTE_LIMIT');
  let i = 0, items = 0;
  const ws = () => { while (i < text.length && /[\x20\t\r\n]/.test(text[i]!)) i++; };
  const string = (): string => {
    const start = i++;
    for (;i<text.length;i++) {
      const ch = text[i];
      if (ch === '\\') { i++; continue; }
      if (ch === '"') {
        const value: unknown = JSON.parse(text.slice(start, ++i));
        return str(value, max);
      }
    }
    return invalid();
  };
  const read = (depth: number): J => {
    if (++items > 8192 || depth > 32) return invalid('MODEL_STRUCTURE_LIMIT');
    ws(); const ch = text[i];
    if (ch === '"') return string();
    if (ch === '{') {
      i++; ws(); const out: Record<string,J> = Object.create(null) as Record<string,J>;
      if (text[i] === '}') { i++; return Object.freeze(out); }
      for (;;) {
        ws(); if (text[i] !== '"') return invalid();
        const key = string(); if (unsafe(key) || Object.hasOwn(out,key)) return invalid();
        ws(); if (text[i++] !== ':') return invalid();
        out[key] = read(depth+1); ws();
        const end = text[i++]; if (end === '}') return Object.freeze(out); if (end !== ',') return invalid();
      }
    }
    if (ch === '[') {
      i++; ws(); const out: J[] = [];
      if (text[i] === ']') { i++; return Object.freeze(out); }
      for (;;) {
        out.push(read(depth+1)); ws(); const end = text[i++];
        if (end === ']') return Object.freeze(out); if (end !== ',') return invalid();
      }
    }
    for (const [literal,value] of [['true',true],['false',false],['null',null]] as const) {
      if (text.startsWith(literal,i)) { i+=literal.length; return value; }
    }
    const start=i;
    while(i<text.length && /[0-9eE+.-]/.test(text[i]!)) i++;
    if (i===start) return invalid();
    const token=text.slice(start,i);
    if (!/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?$/.test(token)) return invalid();
    const n=Number(token); return Number.isFinite(n)?n:invalid();
  };
  const v=read(0);ws();if(i!==text.length)return invalid();return v;
}
/** 安全捕获调用方声明的 JSON 元数据，不调用 getter/toJSON。 */
export function snapshotJson(v: unknown,max:number): J {
  let items=0, bytes=0;
  const seen=new Set<object>();
  const debit=(n:number)=>{bytes+=n;if(bytes>max)invalid('MODEL_BYTE_LIMIT');};
  const copy=(x:unknown,depth:number):J=>{
    if(++items>8192||depth>32)return invalid('MODEL_STRUCTURE_LIMIT');
    if(x===null||typeof x==='boolean'||typeof x==='number'){
      if(typeof x==='number'&&!Number.isFinite(x))return invalid();
      debit(Buffer.byteLength(JSON.stringify(x)));return x;
    }
    if(typeof x==='string'){if(x.length>max)return invalid();debit(Buffer.byteLength(JSON.stringify(x)));return x;}
    if(typeof x!=='object'||x===null||types.isProxy(x)||seen.has(x))return invalid();
    seen.add(x);
    try{
      if(Array.isArray(x)){
        if(x.length>8192-items)return invalid();
        debit(2+x.length);const a:J[]=[];
        for(let i=0;i<x.length;i++){
          const d=Object.getOwnPropertyDescriptor(x,String(i));if(!d||!('value'in d))return invalid();
          a.push(copy(d.value,depth+1));
        }return Object.freeze(a);
      }
      const proto:unknown=Object.getPrototypeOf(x);if(proto!==Object.prototype&&proto!==null)return invalid();
      const o:Record<string,J>=Object.create(null) as Record<string,J>;debit(2);
      for(const k in x){if(!Object.hasOwn(x,k)||unsafe(k)||k.length>max)return invalid();
        const d=Object.getOwnPropertyDescriptor(x,k);if(!d||!('value'in d))return invalid();
        debit(Buffer.byteLength(JSON.stringify(k))+2);o[k]=copy(d.value,depth+1);}
      return Object.freeze(o);
    }finally{seen.delete(x);}
  };
  return copy(v,0);
}
const scalar=(v:unknown,t:string)=>t==='null'?v===null:t==='integer'?typeof v==='number'&&Number.isSafeInteger(v):
  t==='number'?typeof v==='number'&&Number.isFinite(v):typeof v===t;
export function schema(raw:J, strict:boolean, root=true): (v:J)=>boolean {
  const s=object(raw),t=str(s.type,16);
  if(root&&t!=='object')return invalid('MODEL_SCHEMA_UNSUPPORTED');
  const allowed=['type','description',...(t==='object'?['properties','required','additionalProperties']:t==='array'?['items']:['enum'])];
  if(Object.keys(s).some(k=>!allowed.includes(k))||(s.description!==undefined&&typeof s.description!=='string'))return invalid('MODEL_SCHEMA_UNSUPPORTED');
  if(t==='object'){
    if(s.additionalProperties!==false)return invalid('MODEL_SCHEMA_UNSUPPORTED');
    const p=object(s.properties), req=array(s.required).map(k=>str(k,1024)), keys=Object.keys(p);
    if(new Set(req).size!==req.length||req.some(k=>!Object.hasOwn(p,k))||(strict&&req.length!==keys.length))return invalid('MODEL_SCHEMA_UNSUPPORTED');
    const checks=new Map(keys.map(k=>[k,schema(p[k]!,strict,false)]));
    return v=>{
      if(v===null||typeof v!=='object'||Array.isArray(v))return false;
      const o=object(v);return req.every(k=>Object.hasOwn(o,k))&&Object.keys(o).every(k=>checks.get(k)?.(o[k]!)===true);
    };
  }
  if(t==='array'){if(s.items===undefined)return invalid('MODEL_SCHEMA_UNSUPPORTED');const check=schema(s.items,strict,false);return v=>Array.isArray(v)&&v.every(check);}
  if(!['string','number','integer','boolean','null'].includes(t))return invalid('MODEL_SCHEMA_UNSUPPORTED');
  const values=s.enum===undefined?undefined:array(s.enum);
  if(values&&(!values.length||values.some(v=>!scalar(v,t))))return invalid('MODEL_SCHEMA_UNSUPPORTED');
  const set=values===undefined?undefined:new Set(values);
  return v=>scalar(v,t)&&(!set||set.has(v));
}
