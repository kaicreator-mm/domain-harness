import assert from 'node:assert/strict';
import {CliElement} from '@kaicreator/domain-harness';
const cli=new CliElement(1000,64);
assert.equal(await cli.run(process.execPath,['-e','process.stdout.write("ok")']),'ok');
await assert.rejects(cli.run(process.execPath,['-e','process.stdout.write("x".repeat(100))']),/CLI_OUTPUT_LIMIT/);
