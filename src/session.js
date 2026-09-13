/**
 * 游客身份（guest session）。
 *
 * 设计取舍：**不做注册、不做密码**。
 * 用户只需填一个昵称，服务端就发一个随机 token（存 SHA-256 哈希），
 * 目的是让上传者能认领、编辑、删除自己的内容——这是本项目的核心需求，
 * 而账号密码体系会显著提高参与门槛，也会带来一堆本项目不想承担的
 * 安全问题（找回密码、撞库、邮箱验证）。
 *
 * 代价（已在 README 的「已知局限」中说明）：
 *   - 换浏览器 / 清 cookie 就失去身份，无法找回
 *   - 只能防误操作，不能防恶意冒充
 */

export const SESSION_COOKIE = 'xmx_session'
const TOKEN_RE = /^[a-f0-9]{64}$/
const ONE_DAY_MS = 86400000

/** 解析 Cookie 头 */
export function parseCookies(request) {
  const header = request.headers.get('cookie') || ''
  const out = {}
  for (const part of header.split(';')) {
    const i = part.indexOf('=')
    if (i < 0) continue
    const key = part.slice(0, i).trim()
    if (!key) continue
    let value = part.slice(i + 1).trim()
    try { value = decodeURIComponent(value) } catch { /* 保留原值 */ }
    out[key] = value
  }
  return out
}

/** 密码学安全随机 hex 字符串 */
export function randomHex(bytes = 32) {
  const arr = new Uint8Array(bytes)
  crypto.getRandomValues(arr)
  return Array.from(arr).map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function sha256Hex(input) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(input)))
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** 请求是否走 HTTPS（决定 cookie 是否加 Secure） */
export function isSecureRequest(request) {
  if (request.headers.get('x-forwarded-proto') === 'https') return true
  try {
    return new URL(request.url).protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * 从请求里解析当前游客身份。
 * @returns {Promise<{id:number,nickname:string}|null>}
 */
export async function resolveUser(db, request) {
  const token = parseCookies(request)[SESSION_COOKIE]
  if (!token || !TOKEN_RE.test(token)) return null

  const hash = await sha256Hex(token)
  // 用 SELECT * 而不是逐个列名：视图要判断「是否已设账号」、
  // 改密码要校验 password_salt / password_iterations，
  // 之前显式列举时漏过一次列，导致校验静默失败。
  const user = await db.first('SELECT * FROM users WHERE token_hash = ?', [hash])
  if (!user) return null

  // 活跃度按天更新，避免每个请求都写库
  const last = Date.parse(user.last_seen_at || '')
  if (Number.isNaN(last) || Date.now() - last > ONE_DAY_MS) {
    await db.run('UPDATE users SET last_seen_at = ? WHERE id = ?', [new Date().toISOString(), user.id])
  }

  return user
}

/** 创建一个游客身份，返回明文 token（只在这一次响应里下发，服务端只存哈希） */
export async function createGuest(db, nickname, ipHash) {
  const token = randomHex(32)
  const tokenHash = await sha256Hex(token)
  const now = new Date().toISOString()

  const res = await db.run(
    `INSERT INTO users (nickname, token_hash, created_at, last_seen_at, created_ip)
     VALUES (?, ?, ?, ?, ?)`,
    [nickname, tokenHash, now, now, ipHash],
  )
  return { id: res.lastRowId, nickname, token }
}

/** 下发会话 cookie */
export function sessionCookie(token, secure, maxAgeSeconds = 60 * 60 * 24 * 365) {
  const parts = [
    `${SESSION_COOKIE}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAgeSeconds}`,
  ]
  if (secure) parts.push('Secure')
  return parts.join('; ')
}

/** 清除会话 cookie */
export function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
}

/** 带上 Set-Cookie 的重定向响应 */
export function redirectWithCookie(location, cookie, status = 303) {
  const res = new Response(null, { status, headers: { location } })
  res.headers.append('set-cookie', cookie)
  return res
}

/**
 * 只允许站内跳转，防止开放重定向。
 * `//evil.com` 这类协议相对 URL 必须被拒。
 */
export function safeNext(value, fallback = '/') {
  const s = String(value || '')
  if (!s.startsWith('/') || s.startsWith('//') || s.includes('\\')) return fallback
  return s
}

// ------------------------------------------------------------------ 账号密码

/**
 * PBKDF2 迭代次数。
 *
 * 实测（Node 24）：100k ≈ 11.5ms，50k ≈ 5.7ms，25k ≈ 3.0ms。
 * Cloudflare Workers 免费版每次请求的 CPU 上限约 10ms，因此部署到
 * Workers 时应在 wrangler.toml 里把 PBKDF2_ITERATIONS 调到 50000 或更低。
 *
 * 迭代次数**存在每个用户记录里**，所以调整这个默认值只影响新注册的用户，
 * 老用户仍按注册时的迭代次数验证，不会被锁在门外。
 */
export const DEFAULT_PBKDF2_ITERATIONS = 100000
const MAX_ITERATIONS = 2000000

function hexToBytes(hex) {
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i += 1) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return out
}

function bytesToHex(bytes) {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** 用 PBKDF2-SHA256 派生密码哈希（Node 与 Workers 的 crypto.subtle 都支持） */
export async function derivePasswordHex(password, saltHex, iterations) {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(String(password)), 'PBKDF2', false, ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: hexToBytes(saltHex), iterations, hash: 'SHA-256' },
    key,
    256,
  )
  return bytesToHex(new Uint8Array(bits))
}

/** 恒定时间比较（两个哈希长度固定，不会提前返回） */
export function timingSafeEqualHex(a, b) {
  const x = String(a || '')
  const y = String(b || '')
  if (x.length !== y.length) return false
  let diff = 0
  for (let i = 0; i < x.length; i += 1) diff |= x.charCodeAt(i) ^ y.charCodeAt(i)
  return diff === 0
}

export function resolveIterations(env = {}) {
  const raw = Number.parseInt(String(env.PBKDF2_ITERATIONS ?? ''), 10)
  if (!Number.isFinite(raw) || raw < 1000) return DEFAULT_PBKDF2_ITERATIONS
  return Math.min(raw, MAX_ITERATIONS)
}

/** 用户名是否已被占用（大小写不敏感） */
export async function isUsernameTaken(db, username) {
  const row = await db.first(
    'SELECT id FROM users WHERE username = ? COLLATE NOCASE LIMIT 1',
    [String(username || '').trim()],
  )
  return Boolean(row)
}

export async function findUserByUsername(db, username) {
  return db.first(
    'SELECT * FROM users WHERE username = ? COLLATE NOCASE LIMIT 1',
    [String(username || '').trim()],
  )
}

/** 给已有身份设置用户名与密码（游客 → 账号）。用户名冲突由调用方先检查。 */
export async function setCredentials(db, userId, username, password, iterations) {
  const salt = randomHex(16)
  const hash = await derivePasswordHex(password, salt, iterations)
  const now = new Date().toISOString()
  await db.run(
    `UPDATE users
        SET username = ?, password_hash = ?, password_salt = ?,
            password_iterations = ?, password_updated_at = ?
      WHERE id = ?`,
    [String(username).trim(), hash, salt, iterations, now, userId],
  )
}

/** 校验密码是否正确 */
export async function verifyPassword(user, password) {
  if (!user || !user.password_hash || !user.password_salt) return false
  const iterations = Number(user.password_iterations) || DEFAULT_PBKDF2_ITERATIONS
  const hash = await derivePasswordHex(password, user.password_salt, iterations)
  return timingSafeEqualHex(hash, user.password_hash)
}

/**
 * 用用户名 + 密码登录。
 *
 * 成功时**轮换 token**：旧 cookie 立即失效，避免会话固定攻击。
 * 失败时对不存在的用户名也做一次等量派生，避免通过响应时间枚举出哪些用户名已注册。
 *
 * @returns {Promise<{user: object, token: string}|null>}
 */
export async function loginWithPassword(db, username, password, iterations) {
  const user = await findUserByUsername(db, username)

  if (!user || !user.password_hash) {
    await derivePasswordHex(password, '0'.repeat(32), iterations)
    return null
  }

  const ok = await verifyPassword(user, password)
  if (!ok) return null

  const token = randomHex(32)
  await db.run(
    'UPDATE users SET token_hash = ?, last_seen_at = ? WHERE id = ?',
    [await sha256Hex(token), new Date().toISOString(), user.id],
  )
  return { user, token }
}

/** 用户是否已经设置过账号密码 */
export function hasAccount(user) {
  return Boolean(user && user.username && user.password_hash)
}
