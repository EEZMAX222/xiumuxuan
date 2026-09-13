/**
 * Node 专用：基于内置 node:sqlite 的适配器。
 *
 * 单独成文件的原因：src/db.js 会被 Cloudflare Workers 打包，
 * 而 Workers 不支持 node:sqlite。拆开后打包器不会解析到它。
 *
 * 数据持久化：所有用户数据都在 DB_PATH 指向的 SQLite 文件里（默认
 * ./data/xiumuxuan.db）。改代码、重启服务都不会动它——只要不删除
 * 这个文件，数据就在。备份也只需要拷这一个文件（连同 -wal/-shm）。
 */
import { DatabaseSync } from 'node:sqlite'

/** 把 undefined 归一为 null，node:sqlite 不接受 undefined 参数 */
function clean(params = []) {
  return params.map((p) => {
    if (p === undefined) return null
    if (typeof p === 'boolean') return p ? 1 : 0
    return p
  })
}

export async function createSqliteAdapter(file = './data/xiumuxuan.db') {
  const db = new DatabaseSync(file)
  db.exec('PRAGMA journal_mode = WAL;')
  db.exec('PRAGMA foreign_keys = ON;')

  return {
    kind: 'sqlite',
    raw: db,
    async all(sql, params = []) {
      return db.prepare(sql).all(...clean(params))
    },
    async first(sql, params = []) {
      return db.prepare(sql).get(...clean(params)) ?? null
    },
    async run(sql, params = []) {
      const res = db.prepare(sql).run(...clean(params))
      return {
        lastRowId: res?.lastInsertRowid != null ? Number(res.lastInsertRowid) : null,
        changes: res?.changes != null ? Number(res.changes) : 0,
      }
    },
    async exec(sql) {
      db.exec(sql)
    },
    close() {
      db.close()
    },
  }
}
