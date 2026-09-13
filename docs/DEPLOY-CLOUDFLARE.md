# 部署到 Cloudflare Workers

本指南把「休沐选」部署到 Cloudflare Workers + D1，并配置**中国大陆 IP 封锁**。

选 Cloudflare 的理由很直接：它的 `request.cf.country` 由边缘注入、客户端无法伪造，
而且免费版 WAF 就能按国家在网络边缘拦截——这是「不向中国大陆提供服务」这个需求里
最可靠、成本最低的实现方式。

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
- [步骤 8 · 配置 WAF 国家封锁（关键）](#步骤-8--配置-waf-国家封锁关键)
- [步骤 9 · 绑定自定义域名](#步骤-9--绑定自定义域名)
- [上线前检查清单](#上线前检查清单)
- [排错](#排错)
- [配额与成本](#配额与成本)
- [不用 Cloudflare 的替代方案](#不用-cloudflare-的替代方案)

---

## 前置条件

- 一个 Cloudflare 账号（免费计划即可）
- 一个已托管在 Cloudflare 的域名（WAF 规则与自定义域名都需要）
- 本机有 Node.js ≥ 18（跑 wrangler 用）

> 项目本身零依赖，但 `wrangler` 是部署工具，需要单独安装。

## 步骤 1 · 安装 wrangler 并登录

```bash
npm install -g wrangler
# 或者不装全局，后面所有命令用 npx wrangler

wrangler login
```

浏览器会弹出一个授权页面，同意后回到终端。

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

同时**把 `GEO_DEBUG` 改成 `"0"`**：

```toml
[vars]
BLOCKED_COUNTRIES = "CN"
GEO_POLICY = "fail-open"
GEO_DEBUG = "0"                 # ← 生产环境必须是 0
PBKDF2_ITERATIONS = "50000"     # 密码派生迭代次数，见下方说明
```

> **关于 `PBKDF2_ITERATIONS`**
>
> 用户设置账号密码时，服务端会用 PBKDF2-SHA256 派生密码哈希。迭代次数越高越难被离线爆破，
> 但它是纯 CPU 开销，而 **Workers 免费版每次请求的 CPU 上限约 10ms**。
>
> 实测（Node 24）：`100000` 次约 11.5ms，`50000` 约 5.7ms，`25000` 约 3.0ms。
> 所以 Workers 上默认给了 `50000`；如果登录时出现 **1102（CPU 时间超限）**，降到 `25000`。
>
> 这个值会跟着每个用户记录一起保存，因此**调整它只影响之后新设密码的用户**，
> 已注册用户仍按他们注册时的迭代次数校验，不会被锁在门外。

> 为什么必须是 `0`：`GEO_DEBUG=1` 时允许用 `?__geo=` 查询参数覆盖来源地区。
> 这在本机调试很方便，但在生产环境一旦出现「拿不到 CF 国家码」的情况，
> 就等于开了一个可以伪造的旁路。

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

打开 `http://localhost:8787`。本地模式下 `request.cf.country` 通常为空，
因此不会被封锁。想验证拦截行为，可以把 `GEO_DEBUG` 临时设为 `"1"` 然后访问：

```
http://localhost:8787/?__geo=CN
```

## 步骤 6 · 部署

```bash
wrangler deploy
```

部署成功后会得到一个 `https://xiumuxuan.<你的子域>.workers.dev` 地址。

> ⚠️ **`*.workers.dev` 域名上 WAF 规则不生效**——WAF 是按「区域（zone，即你的域名）」配置的。
> 所以真正的封锁要到 [步骤 9](#步骤-9--绑定自定义域名) 绑定自定义域名之后才完整。
> 在那之前，应用层的 `request.cf.country` 检查仍然在工作。

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

应该看到 `companies`、`products`、`reports`、`comments`、`rate_events`、`meta`。

## 步骤 8 · 配置 WAF 国家封锁（关键）

这一步才是「中国大陆 IP 无法访问」的主要保障。

1. 打开 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 选择你的**域名**（不是 Workers 面板）
3. 左侧菜单进入 **Security → WAF → Custom rules**
4. 点击 **Create rule**
5. 填写：
   - **Rule name**：`Block mainland China`
   - **When incoming requests match**：选择 `Custom filter expression`
     - Field：`Country`
     - Operator：`equals`
     - Value：`China`
   - 等价的表达式文本是：`(ip.geoip.country eq "CN")`
   - **Then take action**：`Block`
6. **Deploy**

生效后，来自中国大陆的请求会在边缘直接被 Cloudflare 拦下，**根本不会到达 Worker**，
因此也不消耗 Workers 请求配额。

### 建议同时开启

- **Security → Settings → Bot Fight Mode**：挡掉一部分自动化灌水。
- **Security → WAF → Rate limiting rules**：对 `/reports`、`/comments` 两条路径加一层边缘限流
  （免费计划有 1 条限流规则，够用）。

### 关于港澳台

`ip.geoip.country` 对香港返回 `HK`、澳门 `MO`、台湾 `TW`，因此 `eq "CN"`
精确对应「中国大陆」，不会误伤港澳台。如果你确实想一并封锁，把表达式改成：

```
(ip.geoip.country in {"CN" "HK" "MO" "TW"})
```

同时记得把 `wrangler.toml` 里的 `BLOCKED_COUNTRIES` 改成 `"CN,HK,MO,TW"`，
让应用层与边缘层保持一致。

## 步骤 9 · 绑定自定义域名

1. Cloudflare Dashboard → **Workers & Pages** → 选择 `xiumuxuan`
2. **Settings → Domains & Routes → Add → Custom domain**
3. 填入例如 `xiumuxuan.你的域名.com`

绑定后这个域名会自动走 Cloudflare 代理（橙色云朵），
此时 `request.cf.country` 与 WAF 规则**同时**生效，封锁才真正完整。

## 上线前检查清单

- [ ] `wrangler.toml` 中 `GEO_DEBUG = "0"`
- [ ] `IP_SALT` 已通过 `wrangler secret put` 设置（不是写在 toml 里）
- [ ] WAF 自定义规则 `(ip.geoip.country eq "CN")` 已 Deploy
- [ ] 已绑定自定义域名，且 DNS 记录是**橙色云朵**（Proxied）
- [ ] 用境外出口访问首页正常，用 `?__geo=CN` 能拿到 403（一个不含任何说明的纯文本响应）
- [ ] 上传一条测试情报与评论，确认写入成功
- [ ] 确认没有把 `data/`（本地开发库）提交进版本库

## 排错

| 现象 | 原因与处理 |
| --- | --- |
| 所有请求都 403 | `GEO_DEBUG` 忘了关，或者你在用 `fail-closed` 且请求没有国家码。检查 `wrangler.toml` 的 `[vars]` |
| 从中国大陆仍能访问 | 1) 域名是灰色云朵（未走代理）→ 改成 Proxied；2) 用的是 `*.workers.dev` 地址 → 必须绑自定义域名；3) WAF 规则没 Deploy |
| `D1_ERROR: no such table` | 自动建表没跑成功。手动执行 `wrangler d1 execute xiumuxuan --remote --file=./schema.sql` |
| `Cannot find module 'node:sqlite'` | 你部署的是 Node 入口。Workers 必须用 `src/worker.js`（`wrangler.toml` 的 `main` 字段） |
| 设置密码或登录时报 **1102**（Worker exceeded CPU time limit） | PBKDF2 迭代次数过高。把 `wrangler.toml` 里 `PBKDF2_ITERATIONS` 从 `50000` 降到 `25000` 甚至 `10000`。已设密码的用户不受影响 |
| 时区显示不对 | 页面按 `Asia/Shanghai` 渲染，`compatibility_date` 请保持 `2024-09-23` 之后 |
| `wrangler deploy` 报 `[observability]` 相关错误 | 删掉 `wrangler.toml` 末尾的 `[observability]` 段（部分套餐不支持） |

## 配额与成本

以下数量级以 Cloudflare 官方免费计划为准，**实际额度请以官方定价页为最新依据**：

- **Workers 免费版**：每天约 10 万次请求
- **D1 免费版**：约 5 GB 存储、每天 500 万行读 / 10 万行写
- **WAF 自定义规则**：免费版约 5 条

WAF 在边缘拦截中国大陆流量，这些被拦掉的请求**不会**计入 Workers 请求数。
对一个社区规模的事实库站点，免费额度通常绰绰有余。

真正需要留意的是**被刷**：如果被自动化脚本大量提交，写入量会先撞到 D1 的每日写入上限。
上线后建议观察 `wrangler d1 execute --command "SELECT COUNT(*) FROM reports"` 的增长速度。

## 不用 Cloudflare 的替代方案

如果你坚持自托管（VPS + Node），本项目仍然可用：

```bash
GEO_POLICY=fail-closed \
GEO_DEBUG=0 \
IP_SALT='你的随机盐' \
BLOCKED_COUNTRIES=CN \
NODE_ENV=production \
node src/server.js
```

但要注意：**`fail-closed` 模式下，拿不到国家码的请求会被一律拒绝**，
而你自己的 VPS 也没有能力判断来源国家——你需要自己解决 GeoIP：

1. **仍然是 Cloudflare 代理 + 自建源站**（推荐）：域名挂 Cloudflare，源站只接受
   Cloudflare 的 IP 段，让站点读 `CF-IPCountry` 头。
2. **Nginx + GeoIP2 模块**：在 Nginx 层用 MaxMind 库判断并注入 `X-Country-Code`
   （本项目已支持读取该头）。此时务必保证源站只接受来自你自己 Nginx 的请求，
   否则任何人都能伪造这个头。

无论哪种方案，都请把 `GEO_DEBUG` 设为 `0`。
