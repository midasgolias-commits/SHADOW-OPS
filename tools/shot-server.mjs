/**
 * Servidorzinho só para receber capturas do canvas durante os testes.
 * O jogo roda em http://127.0.0.1:8000 e manda a imagem por POST para cá e ele grava em disco.
 *
 *   node tools/shot-server.mjs      (porta 8001)
 */
import http from 'node:http';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

const OUT = tmpdir();

http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') { res.writeHead(204).end(); return; }
  const url = new URL(req.url, 'http://127.0.0.1:8001');
  if (req.method !== 'POST' || url.pathname !== '/shot') { res.writeHead(404).end(); return; }

  let body = '';
  req.on('data', (d) => (body += d));
  req.on('end', () => {
    const m = /^data:image\/(\w+);base64,(.*)$/s.exec(body);
    const ext = m ? (m[1] === 'jpeg' ? 'jpg' : m[1]) : 'jpg';
    const name = (url.searchParams.get('name') || 'celeiro-shot').replace(/[^\w-]/g, '');
    const file = `${OUT}/${name}.${ext}`;
    writeFileSync(file, Buffer.from(m ? m[2] : body, 'base64'));
    console.log('salvo', file, (m ? m[2].length : body.length), 'bytes base64');
    res.writeHead(200, { 'Content-Type': 'text/plain' }).end(file);
  });
}).listen(8001, '127.0.0.1', () => console.log('servidor de captura em http://127.0.0.1:8001'));
