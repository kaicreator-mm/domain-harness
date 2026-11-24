import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { commandOf, InventoryAuthority, stop } from './authority.js';
import type { Reply } from './authority.js';

/** 仅监听 loopback 的独立进程示例；生产远程部署需要 TLS 和可信身份设施。 */
const path = process.argv[2];
if (!path) throw new Error('HOST_DATABASE_REQUIRED');
const authority = new InventoryAuthority(path);
function respond(res: ServerResponse, reply: Reply): void {
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify(reply));
}
async function route(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const token = req.headers.authorization;
  const principal = req.headers['x-principal'];
  if (req.method !== 'POST' || (req.url !== '/submit' && req.url !== '/readback') ||
      typeof token !== 'string' || !/^Bearer [a-f0-9]{64}$/u.test(token) ||
      typeof principal !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/u.test(principal)) {
    respond(res, stop('REJECT', 'HOST_REQUEST_DENIED')); return;
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    size += bytes.length;
    if (size > 8192) { req.destroy(); return; }
    chunks.push(bytes);
  }
  let raw: unknown;
  try { raw = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown; }
  catch { respond(res, stop('REJECT', 'HOST_INPUT_INVALID')); return; }
  const command = commandOf(raw);
  if (!command) { respond(res, stop('REJECT', 'HOST_INPUT_INVALID')); return; }
  const reply = req.url === '/submit' ? authority.submit(token.slice(7), principal, command) : authority.readback(token.slice(7), principal, command);
  respond(res, reply);
}
const server = createServer((req, res) => {
  void route(req, res).catch(() => { if (!res.headersSent && !res.destroyed) respond(res, stop('UNKNOWN', 'HOST_UNAVAILABLE')); else res.destroy(); });
});
server.requestTimeout = 10_000;
server.listen(0, '127.0.0.1', () => {
  const address = server.address();
  if (typeof address !== 'object' || address === null) throw new Error('HOST_LISTEN_FAILED');
  console.log(JSON.stringify({ port: address.port, pid: process.pid }));
});
function shutdown(): void { server.close(() => { authority.close(); }); server.closeAllConnections(); }
process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
