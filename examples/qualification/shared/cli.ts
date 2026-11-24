import { spawn } from 'node:child_process';

/** Trusted tool adapter: Linux process group, other platforms direct child only. */
export class CliElement {
  constructor(private readonly timeout=10000, private readonly limit=65536) {}
  run(file: string, args: readonly string[]): Promise<string> {
    return new Promise((resolve,reject)=>{
      const group=process.platform==='linux';
      const p=spawn(file,[...args],{shell:false,stdio:['ignore','pipe','pipe'],windowsHide:true,detached:group});
      const chunks: Buffer[]=[]; let size=0; let settled=false;let stopping:string|undefined;let grace:NodeJS.Timeout|undefined;
      const finish=(error?:string)=>{if(settled)return;settled=true;clearTimeout(timer);if(grace)clearTimeout(grace);if(error)reject(new Error(error));else resolve(Buffer.concat(chunks).toString('utf8'));};
      const stop=(code:string)=>{
        if(settled||stopping)return;stopping=code;
        try{if(group&&p.pid)process.kill(-p.pid,'SIGKILL');else p.kill('SIGKILL');}catch{/* Process already exited. */}
        p.stdout.destroy();p.stderr.destroy();
        // Allow a bounded reap window, never wait indefinitely for inherited pipes.
        grace=setTimeout(()=>finish(code),250);
      };
      const timer=setTimeout(()=>stop('CLI_TIMEOUT'),this.timeout);
      p.on('error',()=>stop('CLI_SPAWN'));
      p.stdout.on('data',(b:Buffer)=>{size+=b.length;if(size>this.limit)stop('CLI_OUTPUT_LIMIT');else chunks.push(b);});
      p.stderr.on('data',(b:Buffer)=>{size+=b.length;if(size>this.limit)stop('CLI_OUTPUT_LIMIT');});
      p.once('exit',()=>{if(stopping)finish(stopping);});
      p.once('close',code=>finish(stopping??(code===0?undefined:`CLI_EXIT_${code===null?'SIGNAL':code}`)));
    });
  }
}
