/* 의존성 없는 아주 작은 정적 파일 서버.
 * 음성 인식(마이크)은 localhost 또는 https 에서만 켜지므로,
 * 말하기 모드로 놀려면 파일을 직접 여는 대신 이 서버로 열어야 한다.
 *
 *   npm start        →  http://localhost:8080
 *   npm start -- 3000  →  포트 바꾸기
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.argv[2] || process.env.PORT || 8080);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.md': 'text/markdown; charset=utf-8'
};

const server = http.createServer((req, res) => {
  let urlPath;
  try {
    urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    res.writeHead(400).end('Bad request');
    return;
  }
  if (urlPath.endsWith('/')) urlPath += 'index.html';

  const filePath = path.join(root, urlPath);
  // 루트 밖으로 나가는 경로 차단
  if (!filePath.startsWith(root + path.sep) && filePath !== root) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('찾을 수 없어요: ' + urlPath);
      return;
    }
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache'
    }).end(data);
  });
});

server.listen(port, () => {
  console.log('🌍 세계 국기 퀴즈가 열렸어요!');
  console.log('   브라우저에서  http://localhost:' + port + '  로 접속하세요.');
  console.log('   (마이크로 말하기 모드는 이 주소에서만 동작해요. 끄려면 Ctrl+C)');
});
