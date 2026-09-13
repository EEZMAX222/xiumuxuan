-- 此文件由 scripts/gen-schema-sql.js 从 src/schema.js 自动生成，请勿手改。
-- 用途：npx wrangler d1 execute xiumuxuan --remote --file=./schema.sql

-- 注意：PRAGMA 由各运行时的适配器单独执行（D1 不支持全部 PRAGMA），
-- 因此这里只保留纯 DDL。

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
  created_ip      TEXT    NOT NULL DEFAULT ''
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
  source          TEXT    NOT NULL DEFAULT 'self',
  evidence        TEXT    NOT NULL DEFAULT '',
  detail          TEXT    NOT NULL DEFAULT '',
  created_at      TEXT    NOT NULL,
  ip_hash         TEXT    NOT NULL DEFAULT '',
  status          TEXT    NOT NULL DEFAULT 'published'
);
CREATE INDEX IF NOT EXISTS idx_reports_company ON reports(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_created ON reports(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_ip      ON reports(ip_hash, created_at);

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
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY (parent_id)  REFERENCES comments(id)  ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_comments_company ON comments(company_id, created_at DESC);

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
