import { runOrderCli } from './interaction-client.mjs';

await runOrderCli(process.argv[2]??'order',process.stdin,process.stdout);
