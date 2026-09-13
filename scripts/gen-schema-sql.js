/**
 * 从唯一来源 src/schema.js 生成 schema.sql，
 * 供 `wrangler d1 execute --file=./schema.sql` 使用。
 *
 *   node scripts/gen-schema-sql.js
 */
import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { SCHEMA_SQL } from '../src/schema.js'

const here = dirname(fileURLToPath(import.meta.url))
const target = resolve(here, '..', 'schema.sql')

const header = `-- 此文件由 scripts/gen-schema-sql.js 从 src/schema.js 自动生成，请勿手改。
-- 用途：npx wrangler d1 execute xiumuxuan --remote --file=./schema.sql

`

await writeFile(target, header + SCHEMA_SQL.trim() + '\n', 'utf8')
console.log(`已生成 ${target}`)
