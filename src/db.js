/**
 * 统一数据库适配层的公共部分。
 *
 * 对外暴露的最小接口（D1 与 node:sqlite 完全一致）：
 *   all(sql, params)   -> Promise<Array<object>>
 *   first(sql, params) -> Promise<object|null>
 *   run(sql, params)   -> Promise<{ lastRowId: number|null, changes: number }>
 *   exec(sql)          -> Promise<void>   // 可含多条语句
 *
 * 本文件会被 Cloudflare Workers 打包，因此只包含 D1 相关代码；
 * Node 的 node:sqlite 适配器在 src/db-sqlite.js。
 */

/** 把 undefined 归一为 null；node:sqlite 与 D1 都不接受 undefined 参数 */
function clean(params = []) {
  return params.map((p) => {
    if (p === undefined) return null
    if (typeof p === 'boolean') return p ? 1 : 0
    return p
  })
}

/** Cloudflare D1 适配器 */
export function createD1Adapter(d1) {
  return {
    kind: 'd1',
    async all(sql, params = []) {
      const res = await d1.prepare(sql).bind(...clean(params)).all()
      return res?.results ?? []
    },
    async first(sql, params = []) {
      const res = await d1.prepare(sql).bind(...clean(params)).first()
      return res ?? null
    },
    async run(sql, params = []) {
      const res = await d1.prepare(sql).bind(...clean(params)).run()
      return {
        lastRowId: res?.meta?.last_row_id ?? null,
        changes: res?.meta?.changes ?? 0,
      }
    },
    async exec(sql) {
      await d1.exec(sql)
    },
  }
}

/**
 * 需要补列的历史表（老库升级用）。
 * 新库由 CREATE TABLE 一次建好，这里对已存在的库补齐缺的列。
 */
const COLUMN_MIGRATIONS = [
  ['companies', 'user_id', 'INTEGER'],
  ['products', 'user_id', 'INTEGER'],
  ['reports', 'user_id', 'INTEGER'],
  ['comments', 'user_id', 'INTEGER'],
  ['users', 'username', 'TEXT'],
  ['users', 'password_hash', 'TEXT'],
  ['users', 'password_salt', 'TEXT'],
  ['users', 'password_iterations', 'INTEGER'],
  ['users', 'password_updated_at', 'TEXT'],
]

function splitStatements(schemaSql) {
  return schemaSql
    .split('\n')
    .filter((line) => !/^\s*--/.test(line))   // 去掉整行注释，避免干扰语句切分
    .join('\n')
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !/^PRAGMA\b/i.test(s))
}

/** 补列：老库缺 user_id 时补上；新库已经有时直接跳过 */
async function migrateColumns(db) {
  for (const [table, column, type] of COLUMN_MIGRATIONS) {
    let has = false
    try {
      const cols = await db.all(`PRAGMA table_info(${table})`)
      has = Array.isArray(cols) && cols.some((c) => c && c.name === column)
    } catch {
      has = false
    }
    if (has) continue
    try {
      await db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`, [])
    } catch (err) {
      // 多个 isolate 同时冷启动时可能已被别人加上，忽略重复列错误
      const msg = String((err && err.message) || err)
      if (!/duplicate column/i.test(msg)) throw err
    }
  }
}

/**
 * 确保 schema 已应用（幂等）。启动或冷启动时执行一次即可。
 *
 * 顺序很重要：先建表 → 再补列 → 最后建索引。
 * 因为索引可能引用新补的列，老库上先建索引会报 no such column。
 */
const isCreateTable = (s) => /^CREATE\s+TABLE\b/i.test(s)
// 注意要匹配 `CREATE UNIQUE INDEX`：若漏掉它，会被归到 others 里、
// 在补列之前执行，老库上就会报 no such column
const isCreateIndex = (s) => /^CREATE\s+(UNIQUE\s+)?INDEX\b/i.test(s)

export async function ensureSchema(db, schemaSql) {
  const statements = splitStatements(schemaSql)
  const tables = statements.filter(isCreateTable)
  const indexes = statements.filter(isCreateIndex)
  const others = statements.filter((s) => !isCreateTable(s) && !isCreateIndex(s))

  for (const statement of [...tables, ...others]) {
    await db.run(statement, [])
  }

  await migrateColumns(db)

  for (const statement of indexes) {
    await db.run(statement, [])
  }
}
