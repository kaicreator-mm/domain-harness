import { spawn } from 'node:child_process';

/** Shared application-side subprocess adapter; not an SDK runtime. */
export class CliElement {
  constructor(private readonly timeout=10000, private readonly limit=65536) {}
  run(file: string, args: readonly string[]): Promise<string> {
    return new Promise((resolve,reject)=>{
      const p=spawn(file,[...args],{shell:false,stdio:['ignore','pipe','pipe'],windowsHide:true});
      const chunks: Buffer[]=[]; let size=0; let error: string|undefined;
      const stop=(code:string)=>{if(!error){error=code;p.kill('SIGKILL');}};
      const timer=setTimeout(()=>stop('CLI_TIMEOUT'),this.timeout);
      p.on('error',()=>{error='CLI_SPAWN';});
      p.stdout.on('data',(b:Buffer)=>{size+=b.length;if(size>this.limit)stop('CLI_OUTPUT_LIMIT');else chunks.push(b);});
      p.stderr.on('data',(b:Buffer)=>{size+=b.length;if(size>this.limit)stop('CLI_OUTPUT_LIMIT');});
      p.once('close',code=>{clearTimeout(timer);if(error||code!==0)reject(new Error(error??'CLI_EXIT'));else resolve(Buffer.concat(chunks).toString('utf8'));});
    });
  }
}
