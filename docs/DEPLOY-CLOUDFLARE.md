# 部署到 Cloudflare Workers

本指南把「休沐选」部署到 Cloudflare Workers + D1。

选 Cloudflare 的理由：免费额度够用，D1 是托管 SQLite 不用自己维护服务器，
而且同一份业务代码在本地 Node 和边缘 Worker 上都能跑，行为一致。

---

## 目录

- [前置条件](#前置条件)
- [步骤 1 · 安装 wrangler 并登录](#步骤-1--安装-wrangler-并登录)
- [步骤 2 · 创建 D1 数据库](#步骤-2--创建-d1-数据库)
- [步骤 3 · 填写 wrangler.toml](#步骤-3--填写-wranglertoml)
- [步骤 4 · 设置 IP_SALT 密钥](#步骤-4--设置-ip_salt-密钥)
- [步骤 5 · 本地预览](#步骤-5--本地预览)
- [步骤 6 · 部署](#步骤-6--部署)
- [步骤 7 · 初始化数据表](#步骤-7--初始化数据表)
- [步骤 8 · 绑定自定义域名](#步骤-8--绑定自定义域名)
- [上线前检查清单](#上线前检查清单)
- [排错](#排错)
- [配额与成本](#配额与成本)
- [自托管替代方案](#自托管替代方案)

---

## 前置条件

- 一个 Cloudflare 账号（免费计划即可）
- 一个已托管在 Cloudflare 的域名（绑定自定义域名时需要）
- 本机有 Node.js ≥ 18（跑 wrangler 用）

> 项目本身零运行时依赖，但 `wrangler` 是部署工具，需要单独安装。

## 步骤 1 · 安装 wrangler 并登录

```bash
npm install -g wrangler
# 或者不装全局，后面所有命令用 npx wrangler

wrangler login
```

浏览器会弹出授权页面，同意后回到终端。

## 步骤 2 · 创建 D1 数据库

```bash
wrangler d1 create xiumuxuan
```

输出里会有一行 `database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"`，把它记下来。

## 步骤 3 · 填写 wrangler.toml

打开项目根目录的 `wrangler.toml`，替换 `database_id`：

```toml
[[d1_databases]]
binding = "DB"
database_name = "xiumuxuan"
database_id = "把你的-id-填在这里"
```

运行时变量：

```toml
[vars]
PBKDF2_ITERATIONS = "50000"     # 密码派生迭代次数，见下方说明
```

> **关于 `PBKDF2_ITERATIONS`**
>
> 用户设置账号密码时，服务端用 PBKDF2-SHA256 派生密码哈希。迭代次数越高越难被离线爆破，
> 但它是纯 CPU 开销，而 **Workers 免费版每次请求的 CPU 上限约 10ms**。
>
> 实测（Node 24）：`100000` 次约 11.5ms，`50000` 约 5.7ms，`25000` 约 3.0ms。
> 所以 Workers 上默认给 `50000`；如果登录时报 **1102（CPU 时间超限）**，降到 `25000`。
>
> 这个值会跟着每个用户记录一起保存，因此**调整它只影响之后新设密码的用户**，
> 已注册用户仍按他们注册时的迭代次数校验，不会被锁在门外。

## 步骤 4 · 设置 IP_SALT 密钥

IP 哈希的盐值不要写在配置文件里：

```bash
wrangler secret put IP_SALT
# 提示时粘贴一串随机字符，例如：
# node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

> 换掉盐值会让此前所有 IP 哈希失效（限流记录失去意义，但不会报错）。
> 这是可接受的，不涉及数据丢失。

## 步骤 5 · 本地预览

```bash
wrangler dev
```

打开 `http://localhost:8787`。

## 步骤 6 · 部署

```bash
wrangler deploy
```

部署成功后会得到一个 `https://xiumuxuan.<你的子域>.workers.dev` 地址，可直接访问。

## 步骤 7 · 初始化数据表

**正常情况下不需要手动做这一步**：Worker 在每个 isolate 首次收到请求时会自动执行
幂等的建表语句（见 `src/worker.js` 的 `getApp()`）。

如果你想显式初始化，或者自动建表报错，可以手动执行：

```bash
# 先生成 schema.sql（由 src/schema.js 推导，避免两处维护）
node scripts/gen-schema-sql.js

# 应用到线上库
wrangler d1 execute xiumuxuan --remote --file=./schema.sql

# 应用到本地开发库
wrangler d1 execute xiumuxuan --local --file=./schema.sql
```

验证表已建好：

```bash
wrangler d1 execute xiumuxuan --remote --command "SELECT name FROM sqlite_master WHERE type='table'"
```

应该看到 `companies`、`products`、`reports`、`comments`、`rate_events`、`users`、`meta`。

## 步骤 8 · 绑定自定义域名

1. Cloudflare Dashboard → **Workers & Pages** → 选择 `xiumuxuan`
2. **Settings → Domains & Routes → Add → Custom domain**
3. 填入例如 `xiumuxuan.你的域名.com`

绑定后域名会自动走 Cloudflare 代理（橙色云朵），
此时 `request.cf` 才有内容可用，自定义域名上的安全规则也才会生效。

## 上线前检查清单

- [ ] `IP_SALT` 已通过 `wrangler secret put` 设置（不是写在 toml 里）
- [ ] 已绑定自定义域名，且 DNS 记录是**橙色云朵**（Proxied）
- [ ] 首页能正常打开
- [ ] 注册账号并登录，`/me` 页面正常
- [ ] 上传一条测试情报与评论，确认写入成功
- [ ] 确认没有把 `data/`（本地开发库）提交进版本库

## 排错

| 现象 | 原因与处理 |
| --- | --- |
| `D1_ERROR: no such table` | 自动建表没跑成功。手动执行 `wrangler d1 execute xiumuxuan --remote --file=./schema.sql` |
| `Cannot find module 'node:sqlite'` | 你部署的是 Node 入口。Workers 必须用 `src/worker.js`（`wrangler.toml` 的 `main` 字段） |
| 设置密码或登录时报 **1102**（Worker exceeded CPU time limit） | PBKDF2 迭代次数过高。把 `PBKDF2_ITERATIONS` 从 `50000` 降到 `25000` 甚至 `10000`。已设密码的用户不受影响 |
| 时区显示不对 | 页面按 `Asia/Shanghai` 渲染，`compatibility_date` 请保持 `2024-09-23` 之后 |
| `wrangler deploy` 报 `[observability]` 相关错误 | 删掉 `wrangler.toml` 末尾的 `[observability]` 段（部分套餐不支持） |
| 页面样式是旧的 | 样式表带内容指纹（`/style.css?v=...`），正常不会有缓存问题；若仍异常请强刷 |

## 配额与成本

以下数量级以 Cloudflare 官方免费计划为准，**实际额度请以官方定价页为最新依据**：

- **Workers 免费版**：每天约 10 万次请求
- **D1 免费版**：约 5 GB 存储、每天 500 万行读 / 10 万行写

对一个社区规模的事实库站点，免费额度通常绰绰有余。

真正需要留意的是**被刷**：如果被自动化脚本大量提交，写入量会先撞到 D1 的每日写入上限。
上线后建议观察 `wrangler d1 execute xiumuxuan --remote --command "SELECT COUNT(*) FROM reports"`
的增长速度。

## 自托管替代方案

不想用 Cloudflare 也可以自托管（VPS + Node）：

```bash
NODE_ENV=production \
IP_SALT='你的随机盐' \
node src/server.js
```

用 systemd 或 pm2 守护进程，前面挂 Nginx 做 TLS 终止即可。

数据库就是 `data/` 目录下的 `xiumuxuan.db` 一个文件（连同 `-wal` / `-shm`），
**备份直接拷这个目录**；改代码、重启服务都不会动它。

> 注意：自托管时 `request.cf` 不存在，`CF-IPCountry` 之类的请求头也拿不到。
> 如果你需要按来源地区做访问控制，得自己在反向代理层解决并注入相应请求头。
