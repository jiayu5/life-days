import { mkdir, readFile, writeFile } from 'node:fs/promises';

const files = {
  '/': ['index.html', 'text/html'],
  '/style.css': ['style.css', 'text/css'],
  '/app.js': ['app.js', 'text/javascript'],
  '/ink.js': ['ink.js', 'text/javascript'],
  '/deck.js': ['deck.js', 'text/javascript'],
  '/dates.js': ['dates.js', 'text/javascript'],
};
const assets = Object.fromEntries(await Promise.all(Object.entries(files).map(async ([path, [file, type]]) => [
  path, { type: type + '; charset=utf-8', body: await readFile(file, 'utf8') },
])));
assets['/paper-grain.png'] = {
  type: 'image/png',
  base64: (await readFile('paper-grain.png')).toString('base64'),
};
const worker = await readFile('worker.js', 'utf8');
await mkdir('dist/server', { recursive: true });
await writeFile('dist/server/index.js', worker.replace('ASSET_MAP', () => JSON.stringify(assets)));
