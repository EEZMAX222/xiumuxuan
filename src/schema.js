/**
 * 休沐选 — 数据库结构（唯一来源）
 *
 * 本文件导出的 SCHEMA_SQL 同时用于：
 *   - Cloudflare D1（由 scripts/gen-schema-sql.js 生成 schema.sql 后
 *     通过 `wrangler d1 execute --file=./schema.sql` 应用）
 *   - Node 内置 node:sqlite（启动时直接 exec）
 *
 * 所有语句均为幂等（IF NOT EXISTS），可安全重复执行。
 */
export const SCHEMA_SQL = `
-- 注意：PRAGMA 由各运行时的适配器单独执行（D1 不支持全部 PRAGMA），
-- 因此这里只保留纯 DDL。

-- 用户身份（游客开局，可选设置用户名 + 密码，之后可凭密码找回身份）
CREATE TABLE IF NOT EXISTS users (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  nickname            TEXT    NOT NULL,
  token_hash          TEXT    NOT NULL UNIQUE,   -- SHA-256(session token)，不存明文
  created_at          TEXT    NOT NULL,
  last_seen_at        TEXT    NOT NULL,
  created_ip          TEXT    NOT NULL DEFAULT '',
  -- 以下字段为 NULL 表示「还是纯游客，没有设置账号密码」
  username            TEXT,
  password_hash       TEXT,                      -- PBKDF2-SHA256 派生值，不存明文
  password_salt       TEXT,                      -- 每个用户独立随机盐
  password_iterations INTEGER,                   -- 迭代次数随记录保存，便于日后调整
  password_updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_users_token ON users(token_hash);
-- 用户名大小写不敏感唯一；SQLite 的 UNIQUE 允许多个 NULL，因此未设账号的游客不受影响
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username COLLATE NOCASE);

-- 厂家（生产厂家 / 用工主体）
CREATE TABLE IF NOT EXISTS companies (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT    NOT NULL,
  norm_name       TEXT    NOT NULL UNIQUE,
  aliases         TEXT    NOT NULL DEFAULT '',
  industry        TEXT    NOT NULL DEFAULT '',
  region          TEXT    NOT NULL DEFAULT '',
  website         TEXT    NOT NULL DEFAULT '',
  note            TEXT    NOT NULL DEFAULT '',
  created_at      TEXT    NOT NULL,
  updated_at      TEXT    NOT NULL,
  created_ip      TEXT    NOT NULL DEFAULT '',
  user_id         INTEGER                        -- 条目建立者；为空表示无人认领
);
CREATE INDEX IF NOT EXISTS idx_companies_norm ON companies(norm_name);
CREATE INDEX IF NOT EXISTS idx_companies_name ON companies(name);

-- 产品（搜索入口：产品 -> 生产厂家）
CREATE TABLE IF NOT EXISTS products (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT    NOT NULL,
  norm_name       TEXT    NOT NULL,
  brand           TEXT    NOT NULL DEFAULT '',
  category        TEXT    NOT NULL DEFAULT '',
  company_id      INTEGER NOT NULL,
  barcode         TEXT    NOT NULL DEFAULT '',
  created_at      TEXT    NOT NULL,
  created_ip      TEXT    NOT NULL DEFAULT '',
  user_id         INTEGER,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  UNIQUE (norm_name, company_id)
);
CREATE INDEX IF NOT EXISTS idx_products_norm    ON products(norm_name);
CREATE INDEX IF NOT EXISTS idx_products_company ON products(company_id);

-- 双休情报（用户上传的用工制度报告）
CREATE TABLE IF NOT EXISTS reports (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id      INTEGER NOT NULL,
  verdict         TEXT    NOT NULL,
  schedule        TEXT    NOT NULL DEFAULT '',
  rest_days       REAL,
  weekly_hours    REAL,
  overtime        TEXT    NOT NULL DEFAULT '',
  make_up_work    INTEGER NOT NULL DEFAULT 0,
  position        TEXT    NOT NULL DEFAULT '',
  employment      TEXT    NOT NULL DEFAULT 'unknown',
  evidence        TEXT    NOT NULL DEFAULT '',
  detail          TEXT    NOT NULL DEFAULT '',
  created_at      TEXT    NOT NULL,
  ip_hash         TEXT    NOT NULL DEFAULT '',
  status          TEXT    NOT NULL DEFAULT 'published',
  user_id         INTEGER
);
CREATE INDEX IF NOT EXISTS idx_reports_company ON reports(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_created ON reports(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_ip      ON reports(ip_hash, created_at);
CREATE INDEX IF NOT EXISTS idx_reports_user    ON reports(user_id, created_at DESC);

-- 厂家页评论
CREATE TABLE IF NOT EXISTS comments (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id      INTEGER NOT NULL,
  parent_id       INTEGER,
  nickname        TEXT    NOT NULL DEFAULT '',
  content         TEXT    NOT NULL,
  created_at      TEXT    NOT NULL,
  ip_hash         TEXT    NOT NULL DEFAULT '',
  status          TEXT    NOT NULL DEFAULT 'published',
  user_id         INTEGER,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY (parent_id)  REFERENCES comments(id)  ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_comments_company ON comments(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comments_user    ON comments(user_id, created_at DESC);

-- 防滥用事件记录
CREATE TABLE IF NOT EXISTS rate_events (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  ip_hash         TEXT    NOT NULL,
  action          TEXT    NOT NULL,
  created_at      TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rate_ip ON rate_events(ip_hash, action, created_at);

-- 运行期元信息
CREATE TABLE IF NOT EXISTS meta (
  key             TEXT PRIMARY KEY,
  value           TEXT NOT NULL
);
`

export default SCHEMA_SQL
