import {bootstrap} from './bootstrap.mjs';
import pins from './pins.json' with {type:'json'};
for(const [scenario,input] of [['approval',{score:75}],['learning',{progress:90}]]){
 const runtime=await bootstrap({sdk:pins.sdk,business:pins[scenario]});
 console.log(JSON.stringify({scenario,assembly:runtime.assembly.digest,result:runtime.dispatch(input),snapshot:runtime.snapshot(),receipts:runtime.receipts()},null,2));
}
