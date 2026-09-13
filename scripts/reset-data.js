/**
 * 显式清空所有用户数据。
 *
 *   node scripts/reset-data.js          # 只报告现状，不动任何数据
 *   node scripts/reset-data.js --yes    # 确认后清空
 *
 * 之所以做成显式脚本：清空数据是破坏性操作，必须由人明确发起。
 * 以前靠「测完删库重来」清理，结果连正式数据一起删了——那是不对的。
 */
import { resolve } from 'node:path'
import { createSqliteAdapter } from '../src/db-sqlite.js'

const CONFIRM = process.argv.includes('--yes')
const DB_PATH = resolve(process.env.DB_PATH || './data/xiumuxuan.db')

// 顺序无所谓（没有开启级联也照样能删干净），但要覆盖全部业务表
const TABLES = ['comments', 'reports', 'products', 'companies', 'users', 'rate_events']

async function main() {
  const db = await createSqliteAdapter(DB_PATH)

  const s = await db.first(`SELECT
    (SELECT COUNT(*) FROM companies) AS companies,
    (SELECT COUNT(*) FROM products)  AS products,
    (SELECT COUNT(*) FROM reports)   AS reports,
    (SELECT COUNT(*) FROM comments)  AS comments,
    (SELECT COUNT(*) FROM users)     AS users`)

  console.log(`数据库：${DB_PATH}`)
  console.log(`  厂家 ${s.companies} · 产品 ${s.products} · 情报 ${s.reports}`
    + ` · 评论 ${s.comments} · 用户 ${s.users}`)

  const total = Number(s.companies) + Number(s.products) + Number(s.reports)
    + Number(s.comments) + Number(s.users)

  if (total === 0) {
    console.log('\n本来就没有数据，无需清空。')
    db.close()
    return
  }

  if (!CONFIRM) {
    console.log('\n这是不可撤销的破坏性操作，不会自动执行。')
    console.log('确认要清空，请显式加参数：')
    console.log('  node scripts/reset-data.js --yes')
    console.log('\n想先备份，直接复制这个文件即可（连同同目录的 -wal / -shm）：')
    console.log(`  ${DB_PATH}`)
    db.close()
    return
  }

  for (const table of TABLES) {
    await db.run(`DELETE FROM ${table}`)
  }
  try {
    await db.exec('DELETE FROM sqlite_sequence')
  } catch { /* 表可能不存在 */ }

  console.log('\n已清空全部用户数据（表结构保留）。')
  db.close()
}

main().catch((err) => {
  console.error('清空失败：', err)
  process.exit(1)
})
