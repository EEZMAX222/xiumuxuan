/**
 * Cloudflare Workers 入口。
 *
 * 与 Node 版本共用 src/app.js 的全部业务逻辑，区别只有两个：
 *   - 数据库换成 D1（env.DB 绑定）
 *   - 国家码来自 request.cf.country（边缘注入，无法被客户端伪造）
 *
 * 部署：见 docs/DEPLOY-CLOUDFLARE.md
 */
import { createApp } from './app.js'
import { createD1Adapter, ensureSchema } from './db.js'
import { SCHEMA_SQL } from './schema.js'

let readyPromise = null

/** 每个 isolate 只初始化一次：建表（幂等）+ 组装应用 */
function getApp(env) {
  if (!readyPromise) {
    readyPromise = (async () => {
      const db = createD1Adapter(env.DB)
      await ensureSchema(db, SCHEMA_SQL)
      return createApp({ db, env })
    })().catch((err) => {
      readyPromise = null
      throw err
    })
  }
  return readyPromise
}

export default {
  async fetch(request, env, ctx) {
    try {
      const app = await getApp(env)
      return await app(request)
    } catch (err) {
      console.error('Worker 启动/处理失败:', err && err.stack ? err.stack : err)
      return new Response('500 Internal Server Error', {
        status: 500,
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      })
    }
  },
}
