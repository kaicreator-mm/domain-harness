/**
 * Full-surface native CLI routing without reimplementing 13 proof engines.
 * Pure JS: deterministic planning, input validation, and curated operation catalog.
 * Only a trusted local CLI may use nativeRaw(); MCP must NOT expose it.
 * Exact upstream flags remain discoverable with --help and pass-through.
 */
const string = (label,value) => {
  if (typeof value !== "string" || !value.length || value.includes("\0")) throw new TypeError(label+" must be nonempty text without NUL");
  return value;
};
const str = (flag) => ({flag,type:"string"});
const flag = (f) => ({flag:f,type:"bool"});
const integer = (f,min=0,max=1000000) => ({flag:f,type:"integer",min,max});
const choice = (f,values) => ({flag:f,type:"enum",values});
const operation = (entry,head=[],files=[],options={},tail=[]) => ({entry,head,files,options,tail});
const REGISTRY = {
 lean4:{
  title:"Lean 4 + Lake",source:"https://lean-lang.org/doc/reference/latest/Build-Tools-and-Distribution/Lake/",
  entries:["lean","lake"], help:{entry:"lake",args:["--help"]},
  runtime:{"kind":"binary","command":"lean","probeArgs":["--version"]},
  operations:{
   check:operation("lean",[],["input"]),
   build:operation("lake",["build"],[],{target:str(""),package:str("--package")}),
   test:operation("lake",["test"]),
   lint:operation("lake",["lint"]),
   "check-build":operation("lake",["check-build"]),
   "check-test":operation("lake",["check-test"]),
   "check-lint":operation("lake",["check-lint"]),
   "query":operation("lake",["query"],[],{target:str("")})
  }
 },
 z3:{
  title:"Z3",source:"https://github.com/Z3Prover/z3",
  entries:["z3"],help:{entry:"z3",args:["-h"]},
  runtime:{"kind":"binary","command":"z3","probeArgs":["-version"]},
  operations:{
   solve:operation("z3",["-smt2"],["input"],{timeout:integer("-T:",1,120000),seed:integer("sat.random_seed=",0,2147483647)}),
   "dimacs":operation("z3",["-dimacs"],["input"],{timeout:integer("-T:",1,120000)})
  }
 },
 cvc5:{
  title:"cvc5",source:"https://cvc5.github.io/docs/latest/options.html",
  entries:["cvc5"],help:{entry:"cvc5",args:["--help"]},
  runtime:{"kind":"binary","command":"cvc5","probeArgs":["--version"]},
  operations:{
   solve:operation("cvc5",["--lang","smt2"],["input"],{models:flag("--produce-models"),cores:flag("--produce-unsat-cores"),proofs:flag("--produce-proofs"),tlimit:integer("--tlimit=",1,120000)}),
   sygus:operation("cvc5",["--lang","sygus2"],["input"],{tlimit:integer("--tlimit=",1,120000)})
  }
 },
 "tla-tlc":{
  title:"TLA+ tools: TLC, SANY, PlusCal, XMLExporter",source:"https://github.com/tlaplus/tlaplus/blob/master/USE.md",
  entries:["tlc","sany","pcal","xml-exporter"],help:{entry:"tlc",args:["-help"]},
  runtime:{"kind":"java-jar","command":"java","jarEnv":"TLA2TOOLS_JAR","mainClass":"tlc2.TLC","probeArgs":["-help"]},
  operations:{
   check:operation("tlc",[],["input"],{config:str("-config"),workers:integer("-workers",1,128),depth:integer("-depth",1,100000),dump_trace:str("-dumpTrace")}),
   // TLC simulation is unbounded unless limited: runs must be "num=<traces>" (TLC -simulate [file=X,num=Y]).
   simulate:operation("tlc",["-simulate"],["input"],{runs:str(""),config:str("-config"),depth:integer("-depth",1,100000),seed:integer("-seed",0,2147483647)}),
   parse:operation("sany",[],["input"]),
   pluscal:operation("pcal",[],["input"]),
   xml:operation("xml-exporter",[],["input"])
  }
 },
 apalache:{
  title:"Apalache",source:"https://apalache-mc.org/docs/apalache/running.html",
  entries:["apalache-mc"],help:{entry:"apalache-mc",args:["--help"]},
  runtime:{"kind":"binary","command":"apalache-mc","probeArgs":["version"]},
  operations:{
   check:operation("apalache-mc",["check"],["input"],{length:integer("--length=",0,100000),init:str("--init="),next:str("--next="),inv:str("--inv="),solver:choice("--smt-solver=",["z3","cvc5"]),output:str("--out-dir=")}),
   parse:operation("apalache-mc",["parse"],["input"],{output:str("--output=")}),
   typecheck:operation("apalache-mc",["typecheck"],["input"]),
   simulate:operation("apalache-mc",["simulate"],["input"],{length:integer("--length=",0,100000),runs:integer("--max-run=",1,100000)}),
   // apalache-mc 0.62.x `test` takes <file> <before> <action> <assertion> positionally (verified against the installed release help).
   test:operation("apalache-mc",["test"],["input","before","action","assertion"],{})
  }
 },
 alloy:{
  title:"Alloy Analyzer 6",source:"https://github.com/AlloyTools/org.alloytools.alloy/releases",
  entries:["alloy"],help:{entry:"alloy",args:["help"]},
  runtime:{"kind":"alloy","command":"alloy","jarEnv":"FORMAL_ALLOY_JAR","binEnv":"FORMAL_ALLOY_BIN","probeArgs":["help"]},
  operations:{
   exec:operation("alloy",["exec"],["input"],{command:integer("-c",0,10000),solver:str("-s")}),
   help:operation("alloy",["help"]),
   lsp:operation("alloy",["lsp"])
  }
 },
 souffle:{
  title:"Soufflé Datalog",source:"https://souffle-lang.github.io/execute",
  entries:["souffle"],help:{entry:"souffle",args:["--help"]},
  runtime:{"kind":"binary","command":"souffle","probeArgs":["--version"]},
  operations:{
   run:operation("souffle",[],["input"],{facts:str("-F"),output:str("-D"),jobs:integer("-j",1,128),profile:str("-p"),debug:str("-r")}),
   compile:operation("souffle",["-c"],["input"],{facts:str("-F"),output:str("-D"),jobs:integer("-j",1,128)}),
   generate:operation("souffle",[],["input"],{target:str("-g"),jobs:integer("-j",1,128)}),
   parse:operation("souffle",["--parse-errors"],["input"])
  }
 },
 "rdf-shacl":{
  title:"pySHACL",source:"https://github.com/RDFLib/pySHACL",
  entries:["pyshacl"],help:{entry:"pyshacl",args:["--help"]},
  runtime:{"kind":"python-module","command":"python3","module":"pyshacl","pythonEnv":"FORMAL_PYSHACL_PYTHON","probeArgs":["--help"]},
  operations:{
   validate:operation("pyshacl",[],["input"],{shapes:str("-s"),ontology:str("-e"),inference:choice("-i",["none","rdfs","owlrl","both"]),format:choice("-f",["human","table","turtle","xml","json-ld","nt","n3"]),meta:flag("-m"),advanced:flag("-a"),abort:flag("--abort"),output:str("-o")})
  }
 },
 vampire:{
  title:"Vampire theorem prover",source:"https://github.com/vprover/vampire",
  entries:["vampire"],help:{entry:"vampire",args:["--show_options","on"]},
  runtime:{"kind":"binary","command":"vampire","probeArgs":["--help"]},
  operations:{
   // 5.1.0 removed --mode casc_sat: sat intent is --mode casc --intent sat (verified against installed release).
   prove:operation("vampire",[],["input"],{mode:choice("--mode",["casc","portfolio"]),intent:choice("--intent",["unsat","sat"]),proof:choice("--proof",["tptp","off"])}),
   "casc":operation("vampire",["--mode","casc"],["input"]),
   "casc-sat":operation("vampire",["--mode","casc","--intent","sat"],["input"])
  }
 },
 clingo:{
  title:"Clingo ASP",source:"https://potassco.org/clingo/",
  entries:["clingo"],help:{entry:"clingo",args:["--help=3"]},
  // Two legitimate launchers, picked only by explicit operator configuration:
  // default stays the explicitly configured Python module (FORMAL_CLINGO_PYTHON);
  // setting FORMAL_CLINGO_BIN pins the official native clingo executable by exact
  // path (e.g. the #24 canonical Debian 13 bundle binary). The pinned path is the
  // sole search candidate: no PATH lookup and no FORMAL_TOOLS_BIN_DIR shadowing.
  runtime:{"kind":"python-module","command":"python3","module":"clingo","pythonEnv":"FORMAL_CLINGO_PYTHON","binEnv":"FORMAL_CLINGO_BIN","binProbeArgs":["--version"],"probeArgs":["--help"]},
  operations:{
   solve:operation("clingo",[],["input"],{models:integer("--models=",0,1000000),format:choice("--outf=",["0","1","2","3"]),opt:choice("--opt-mode=",["opt","enum","optN","ignore"]),time:integer("--time-limit=",1,120000)}),
   ground:operation("clingo",["--mode=gringo"],["input"]),
   "solve-json":operation("clingo",["--outf=2"],["input"],{models:integer("--models=",0,1000000)})
  }
 },
 "apache-jena":{
  title:"Apache Jena",source:"https://jena.apache.org/documentation/tools/",
  entries:["riot","arq","sparql","qparse","uparse","update","turtle","ntriples","nquads"],help:{entry:"riot",args:["--help"]},
  runtime:{"kind":"binary","command":"riot","probeArgs":["--help"],"windowsWrapperWarning":true},
  operations:{
   validate:operation("riot",["--validate"],["input"]),
   convert:operation("riot",[],["input"],{format:str("--output=")}),
   query:operation("arq",[],[],{data:str("--data"),query:str("--query"),format:str("--results=")}),
   parsequery:operation("qparse",[],[],{input:str("--file")}),
   parseupdate:operation("uparse",[],[],{input:str("--file")}),
   "update":operation("update",[],[],{data:str("--data"),input:str("--update")})
  }
 },
 prob:{
  title:"ProB",source:"https://prob.cs.uni-duesseldorf.de/w/index.php?title=Using_the_Command-Line_Version_of_ProB",
  entries:["probcli"],help:{entry:"probcli",args:["--help"]},
  runtime:{"kind":"binary","command":"probcli","probeArgs":["-version"]},
  operations:{
   check:operation("probcli",[],["input"],{bounded:integer("-mc",1,10000000)},["-model_check"]),
   "bounded":operation("probcli",[],["input"],{states:integer("-mc",1,10000000)}),
   animate:operation("probcli",[],["input"],{steps:integer("-execute",1,100000)}),
   "no-deadlock":operation("probcli",[],["input"],{},["-model_check","-nodead"])
  }
 },
 dafny:{
  title:"Dafny",source:"https://dafny.org/dafny/DafnyRef/DafnyRef",
  entries:["dafny"],help:{entry:"dafny",args:["--help"]},
  runtime:{"kind":"binary","command":"dafny","probeArgs":["--version"]},
  operations:{
   verify:operation("dafny",["verify"],["input"]),
   resolve:operation("dafny",["resolve"],["input"]),
   build:operation("dafny",["build"],["input"]),
   run:operation("dafny",["run"],["input"]),
   test:operation("dafny",["test"],["input"]),
   "format-check":operation("dafny",["format","--check"],["input"]),
   "format-print":operation("dafny",["format","--print"],["input"])
  }
 }
};
/** Operator-provided names are not executable names; only known entry keys are accepted. */
export const toolIds=Object.freeze(Object.keys(REGISTRY));
export function describeNativeTool(tool){
 if(!Object.hasOwn(REGISTRY,tool))throw new TypeError("unknown tool "+String(tool));
 const record=REGISTRY[tool];
 return {id:tool,title:record.title,entries:[...record.entries],
   operations:Object.fromEntries(Object.entries(record.operations).map(([k,v])=>[k,
     {entry:v.entry,required:[...v.files],options:Object.fromEntries(Object.entries(v.options).map(([name,opt])=>[name,{type:opt.type,values:opt.values??null,min:opt.min??null,max:opt.max??null}]))}])),
   documentation:record.source,coverage:"typed operations plus trusted-local upstream argument pass-through; runtime depends on installed release",runtime:{...record.runtime,probeArgs:[...record.runtime.probeArgs]}};
}
function encodeOpt(name,definition,val){
 if(definition.type==="bool"){if(typeof val!=="boolean")throw new TypeError("flag "+name+" must be boolean");return val?[definition.flag]:[];}
 if(definition.type==="bool"){if(typeof val!=="boolean")throw new TypeError("flag "+name+" must be boolean");return val?[definition.flag]:[];}
 if(definition.type==="integer"){if(!Number.isInteger(val)||val<definition.min||val>definition.max)throw new TypeError("invalid number for "+name);}
 if(definition.type==="enum"&&!definition.values.includes(String(val)))throw new TypeError("invalid enum "+name);
 if(definition.type==="string")string(name,val);
 const text=String(val);
 if(!definition.flag)return [text];
 if(definition.flag.endsWith("=")||definition.flag.endsWith(":"))return [definition.flag+text];
 return [definition.flag,text];
}
/** Plan only: does not launch subprocess or read files.
 * @param {{[key:string]:string|number|boolean|undefined}} [settings] option values keyed by input/option name */
export function planNative(tool,op,settings={}){
 if(!Object.hasOwn(REGISTRY,tool))throw new TypeError("unknown tool "+String(tool));
 const spec=REGISTRY[tool].operations[op];
 if(!spec)throw new TypeError("unknown operation "+String(op)+" for "+tool);
 if(!settings||typeof settings!=="object"||Array.isArray(settings))throw new TypeError("settings must be a JSON object");
 const permissible=new Set([...spec.files,...Object.keys(spec.options)]);
 for(const name of Object.keys(settings))if(!permissible.has(name))throw new TypeError("unknown option "+name+" for "+tool+"/"+op);
 const filePaths=spec.files.map(name=>string(name,settings[name]));
 const headArgs=[...spec.head];
 const optionArgs=[];
 for(const [name,def] of Object.entries(spec.options)){
   if(settings[name]!==undefined)optionArgs.push(...encodeOpt(name,def,settings[name]));
 }
 if(tool==="prob"&&op==="check"&&settings.bounded!==undefined) {
   // -mc <n> is bounded and must not be followed by unbounded -model_check.
   return {tool,operation:op,entry:spec.entry,args:[...filePaths,...headArgs,...optionArgs],mode:"typed",runtime:"NOT_RUN"};
 }
 // ProB expects the input filename before switches; apalache-mc 0.62.x `test` takes
 // <file> <before> <action> <assertion> positionally after the subcommand.
 const args=tool==="prob"
   ?[...filePaths,...headArgs,...optionArgs,...spec.tail]
   :(tool==="apalache"&&op==="test")
   ?[...headArgs,...filePaths,...optionArgs]
   :[...headArgs,...optionArgs,...filePaths,...spec.tail];
 return {tool,operation:op,entry:spec.entry,args,mode:"typed",runtime:"NOT_RUN"};
}
/** Local trusted CLI only. Do NOT expose raw arguments via MCP. */
export function planRawNative(tool,entry,args){
 if(!Object.hasOwn(REGISTRY,tool))throw new TypeError("unknown tool");
 if(!REGISTRY[tool].entries.includes(entry))throw new TypeError("unknown entry for "+tool);
 if(!Array.isArray(args)||args.length>256||args.some(x=>typeof x!=="string"||x.includes("\0")))throw new TypeError("invalid native argument array");
 return {tool,operation:"raw",entry,args:[...args],mode:"LOCAL_CLI_ONLY",runtime:"NOT_RUN"};
}
/** Engine-native --help is always authoritative for this installed binary/version. */
export function planNativeHelp(tool,entry){
 if(!Object.hasOwn(REGISTRY,tool))throw new TypeError("unknown tool");
 if(entry===undefined)return {tool,operation:"help",entry:REGISTRY[tool].help.entry,args:[...REGISTRY[tool].help.args],mode:"LOCAL_CLI",runtime:"NOT_RUN"};
 const k=string("entry",entry);
 if(!REGISTRY[tool].entries.includes(k))throw new TypeError("unknown entry");
 const flagMap={tlc:"-help",sany:"-help",pcal:"-help","xml-exporter":"-help",alloy:"help",lake:"--help",lean:"--help",vampire:"--show_options",clingo:"--help=3",z3:"-h",probcli:"--help"};
 return {tool,operation:"help",entry:k,args:k==="vampire"?["--show_options","on"]:[flagMap[k]??"--help"],mode:"LOCAL_CLI",runtime:"NOT_RUN"};
}


/**
 * Authoritative tool IDs, CLI entries, metadata and runtime probe descriptors all
 * live in REGISTRY. Other integrations MUST import this catalog, not copy IDs.
 * Version probing is separate from claiming the native tool is correctly installed.
 */
export function toolRuntimeProfile(tool) {
  if (!Object.hasOwn(REGISTRY,tool)) throw new TypeError("unknown tool: "+String(tool));
  const record=REGISTRY[tool],runtime=record.runtime;
  return {
    id:tool,title:record.title,source:record.source,
    entries:[...record.entries],help:{entry:record.help.entry,args:[...record.help.args]},
    runtime:{...runtime,probeArgs:[...runtime.probeArgs]},
    operationCount:Object.keys(record.operations).length
  };
}
export function planToolProbe(tool,env={}) {
  const record=toolRuntimeProfile(tool),runtime=record.runtime,missing=[];
  if(!env||typeof env!=="object"||Array.isArray(env))throw new TypeError("environment must be an object");
  let argv,launcher=runtime.kind,requiredFiles=[];
  if(runtime.kind==="java-jar"){
    if(!env[runtime.jarEnv]) missing.push(runtime.jarEnv);
    else {
      requiredFiles=[String(env[runtime.jarEnv])];
      argv=[runtime.command,"-cp",String(env[runtime.jarEnv]),runtime.mainClass,...runtime.probeArgs];
    }
  } else if(runtime.kind==="alloy") {
    if(env[runtime.jarEnv]){
      launcher="alloy-jar"; requiredFiles=[String(env[runtime.jarEnv])];
      argv=["java","-jar",String(env[runtime.jarEnv]),...runtime.probeArgs];
    } else if(env[runtime.binEnv]){
      launcher="alloy-bin";argv=[String(env[runtime.binEnv]),...runtime.probeArgs];
    } else missing.push(runtime.jarEnv+" or "+runtime.binEnv);
  } else if(runtime.kind==="python-module"){
    if(runtime.binEnv&&env[runtime.binEnv]){
      // Explicitly pinned native binary: one operator-configured path, recorded in
      // requiredFiles for SHA fingerprinting. Never resolved via PATH or bin dir.
      launcher=runtime.module+"-bin";
      requiredFiles=[String(env[runtime.binEnv])];
      argv=[String(env[runtime.binEnv]),...(runtime.binProbeArgs??runtime.probeArgs)];
    } else {
      argv=[String(env[runtime.pythonEnv]||runtime.command),"-m",runtime.module,...runtime.probeArgs];
    }
  } else {
    argv=[runtime.command,...runtime.probeArgs];
  }
  return {
    tool,launcher,status:missing.length?"NEEDS_CONFIGURATION":"PLANNED",
    ...(missing.length?{missing}:{}),argv:argv??null,requiredFiles,
    envHints:[...new Set([...(runtime.jarEnv?[runtime.jarEnv]:[]),...(runtime.binEnv?[runtime.binEnv]:[]),
      ...(runtime.pythonEnv?[runtime.pythonEnv]:[]),"FORMAL_TOOLS_BIN_DIR"])]
  };
}
