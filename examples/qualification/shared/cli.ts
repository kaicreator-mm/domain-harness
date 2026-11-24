import { spawn } from 'node:child_process';

/** Trusted foreground tools. Linux owns a process group; elsewhere only the direct child.
 * On Linux signal the group once, while the leader is active or immediately on its exit.
 * No delayed signal to a reaped leader's PID, and no promise about escaped process groups.
 */
export class CliElement {
  constructor(private readonly timeout=10000, private readonly limit=65536) {}
  run(file: string, args: readonly string[]): Promise<string> {
    return new Promise((resolve,reject)=>{
      const group=process.platform==='linux';
      const p=spawn(file,[...args],{shell:false,stdio:['ignore','pipe','pipe'],windowsHide:true,detached:group});
      const chunks:Buffer[]=[];let size=0,settled=false,exited=false,signaled=false,cleanupOK=true;
      let stopping:string|undefined;let grace:NodeJS.Timeout|undefined;
      const finish=(error?:string)=>{if(settled)return;settled=true;clearTimeout(timer);if(grace)clearTimeout(grace);if(error)reject(Error(error));else resolve(Buffer.concat(chunks).toString('utf8'));};
      const terminate=()=>{
        if(signaled)return cleanupOK;
        signaled=true;
        try{if(group&&p.pid)process.kill(-p.pid,'SIGKILL');else if(!exited&&p.pid&&!p.kill('SIGKILL'))cleanupOK=false;}
        catch(error){if((error as NodeJS.ErrnoException).code!=='ESRCH')cleanupOK=false;}
        return cleanupOK;
      };
      const stop=(code:string)=>{
        if(settled||stopping)return;stopping=code;
        if(!terminate())stopping='CLI_CLEANUP_FAILED';
        p.stdout.destroy();p.stderr.destroy();
        if(exited||!p.pid){finish(stopping);return;}
        // A failed reap is not reported as successful resource cleanup.
        grace=setTimeout(()=>finish('CLI_REAP_TIMEOUT'),250);
      };
      const timer=setTimeout(()=>stop('CLI_TIMEOUT'),this.timeout);
      p.on('error',()=>stop('CLI_SPAWN'));
      p.stdout.on('data',(b:Buffer)=>{size+=b.length;if(size>this.limit)stop('CLI_OUTPUT_LIMIT');else chunks.push(b);});
      p.stderr.on('data',(b:Buffer)=>{size+=b.length;if(size>this.limit)stop('CLI_OUTPUT_LIMIT');});
      p.once('exit',code=>{
        exited=true;
        if(stopping){finish(stopping);return;}
        if(code!==0){stop(`CLI_EXIT_${code===null?'SIGNAL':code}`);return;}
        // Foreground contract: even successful tools must not leave same-group background jobs.
        // Signal immediately on exit, but let buffered stdout drain before success.
        if(group&&!terminate())stop('CLI_CLEANUP_FAILED');
      });
      p.once('close',code=>finish(stopping??(code===0?undefined:`CLI_EXIT_${code===null?'SIGNAL':code}`)));
    });
  }
}
