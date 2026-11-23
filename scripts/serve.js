import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import './build.js'

const root = fileURLToPath(new URL('../dist/', import.meta.url))
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.tja': 'text/plain', '.wav': 'audio/wav', '.m4a': 'audio/mp4' }
const port = Number(process.env.PORT ?? 4173)
createServer(async (request, response) => {
  try {
    const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname)
    const file = resolve(join(root, path === '/' ? 'index.html' : path))
    if (!file.startsWith(resolve(root) + sep)) throw new Error('Invalid path')
    const info = await stat(file)
    if (!info.isFile()) throw new Error('Missing file')
    response.writeHead(200, { 'Content-Type': mime[extname(file)] ?? 'application/octet-stream', 'Content-Length': info.size, 'Cache-Control': 'no-store' })
    if (request.method === 'HEAD') response.end()
    else createReadStream(file).pipe(response)
  } catch {
    response.writeHead(404).end('Not found')
  }
}).listen(port, '127.0.0.1', () => console.log(`http://localhost:${port}`))
