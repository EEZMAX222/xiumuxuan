/**
 * Node 运行时入口（本地开发 / 自托管）。
 *
 * 用 node:http 把 Node 的 IncomingMessage 适配成 Web 标准 Request，
 * 再把应用返回的 Response 写回 socket —— 因此与 Cloudflare Workers
 * 版本共用 100% 的业务代码。
 *
 * 零运行时依赖：数据库使用 Node 22.5+ 内置的 node:sqlite。
 */
import http from 'node:http'
import { mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { createApp } from './app.js'
import { ensureSchema } from './db.js'
import { createSqliteAdapter } from './db-sqlite.js'
import { resolveIterations } from './session.js'
import { SCHEMA_SQL } from './schema.js'

const PORT = Number(process.env.PORT || 8787)
const HOST = process.env.HOST || '0.0.0.0'
const DB_PATH = resolve(process.env.DB_PATH || './data/xiumuxuan.db')

function buildEnv() {
  const isProd = process.env.NODE_ENV === 'production'
  return {
    ...process.env,
    NODE_ENV: isProd ? 'production' : 'development',
    // 封锁的国家/地区（逗号分隔）。CN = 中国大陆
    BLOCKED_COUNTRIES: process.env.BLOCKED_COUNTRIES ?? 'CN',
    // fail-open：拿不到国家码时放行（配合 Cloudflare 代理使用）
    // fail-closed：拿不到国家码时也拒绝（纯自托管、不希望漏放时使用）
    GEO_POLICY: process.env.GEO_POLICY ?? 'fail-open',
    // 本地调试开关：允许用 ?__geo=CN / X-Debug-Country 头模拟来源地区。
    // 生产环境务必为 0，否则可在没有 Cloudflare 头时被伪造绕过。
    GEO_DEBUG: process.env.GEO_DEBUG ?? (isProd ? '0' : '1'),
    IP_SALT: process.env.IP_SALT ?? 'dev-salt-please-change',
    PBKDF2_ITERATIONS: process.env.PBKDF2_ITERATIONS ?? '',
  }
}

/** Node 请求头 -> Web Headers */
function headersFromNode(req) {
  const headers = new Headers()
  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) {
      for (const v of value) headers.append(key, v)
    } else if (value !== undefined) {
      headers.set(key, value)
    }
  }
  return headers
}

function readBody(req) {
  return new Promise((resolvePromise, reject) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => resolvePromise(chunks.length ? Buffer.concat(chunks) : null))
    req.on('error', reject)
  })
}

/** Web Response -> Node 响应 */
async function writeResponse(res, response) {
  res.statusCode = response.status
  const cookies = typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie()
    : []
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() === 'set-cookie') return
    try {
      res.setHeader(key, value)
    } catch { /* 忽略非法头 */ }
  })
  if (cookies.length) res.setHeader('set-cookie', cookies)

  if (!response.body) {
    res.end()
    return
  }
  const buf = Buffer.from(await response.arrayBuffer())
  res.setHeader('content-length', String(buf.byteLength))
  res.end(buf)
}

async function main() {
  await mkdir(dirname(DB_PATH), { recursive: true })
  const db = await createSqliteAdapter(DB_PATH)
  await ensureSchema(db, SCHEMA_SQL)

  const env = buildEnv()
  const app = createApp({ db, env })

  const server = http.createServer(async (req, res) => {
    const started = Date.now()
    try {
      const host = req.headers.host || `127.0.0.1:${PORT}`
      const url = new URL(req.url || '/', `http://${host}`)

      const headers = headersFromNode(req)
      // 记录 socket 层地址，便于限流；若已有代理头则保留代理头
      if (!headers.has('x-forwarded-for') && req.socket.remoteAddress) {
        headers.set('x-forwarded-for', req.socket.remoteAddress)
      }

      const init = { method: req.method, headers }
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        const body = await readBody(req)
        if (body) init.body = body
      }

      const request = new Request(url, init)
      const response = await app(request)
      await writeResponse(res, response)

      const ms = Date.now() - started
      console.log(`${req.method} ${url.pathname}${url.search} -> ${response.status} (${ms}ms)`)
    } catch (err) {
      console.error('[休沐选] 请求处理失败:', err)
      if (!res.headersSent) {
        res.statusCode = 500
        res.setHeader('content-type', 'text/plain; charset=utf-8')
      }
      res.end('500 Internal Server Error')
    }
  })

  server.listen(PORT, HOST, () => {
    const debugOn = String(env.GEO_DEBUG) === '1'
    console.log('')
    console.log('  休沐选 · XiuMuXuan')
    console.log('  ---------------------------------------------')
    console.log(`  本地地址   http://127.0.0.1:${PORT}`)
    console.log(`  数据库     ${DB_PATH}`)
    console.log(`  封锁地区   ${env.BLOCKED_COUNTRIES}  (策略 GEO_POLICY=${env.GEO_POLICY})`)
    console.log(`  密码派生   PBKDF2-SHA256 × ${resolveIterations(env)}`)
    console.log(`  地区模拟   ${debugOn ? '已开启 → 用 ?__geo=CN 预览拦截（403）' : '已关闭'}`)
    console.log('')
  })

  const shutdown = () => {
    console.log('\n正在关闭…')
    server.close(() => {
      try { db.close?.() } catch { /* ignore */ }
      process.exit(0)
    })
    setTimeout(() => process.exit(0), 2000).unref()
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

main().catch((err) => {
  console.error('启动失败:', err)
  process.exit(1)
})
