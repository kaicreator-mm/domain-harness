import assert from 'node:assert/strict';
import {JsonReader,YamlReader} from '@kaicreator/domain-harness';
for(const [reader,source] of [[new JsonReader(),'{"name":"sample","n":7}'],[new YamlReader(),'name: sample\nn: 7\n']] as const){
 const data=reader.read(source);assert.equal(data.kind,'SUCCEEDED');assert.deepEqual(data.value,{name:'sample',n:7});
 const written=reader.write(data.value);assert.equal(written.kind,'SUCCEEDED');assert.deepEqual(reader.read(written.value),data);
}
