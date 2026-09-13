/**
 * 休沐选 — 业务逻辑：归一化、校验、双休指数、限流、格式化。
 * 不依赖任何运行时特有的 API（crypto.subtle 在 Workers 与 Node 18+ 均可用）。
 */

// ---------------------------------------------------------------- 枚举定义

/** 每周实际休息情况 */
export const VERDICTS = {
  two_day: { label: '双休', short: '双休', desc: '每周固定休两天，基本不占用周末', score: 1.0, tone: 'good' },
  two_day_ish: { label: '基本双休', short: '基本双休', desc: '名义双休，偶有周末加班但可调休', score: 0.85, tone: 'good' },
  alternating: { label: '大小周', short: '大小周', desc: '一周双休一周单休，轮流进行', score: 0.4, tone: 'warn' },
  one_day: { label: '单休', short: '单休', desc: '每周只休一天', score: 0.1, tone: 'bad' },
  none: { label: '无休 / 全月无休', short: '无休', desc: '几乎没有完整休息日', score: 0.0, tone: 'bad' },
  unknown: { label: '说不清 / 变动大', short: '说不清', desc: '排班不固定或难以概括', score: null, tone: 'muted' },
}

/** 信息来源已取消：不再收集、也不参与权重计算。 */

/** 在职状态 */
export const EMPLOYMENTS = {
  current: { label: '在职' },
  former: { label: '已离职' },
  contractor: { label: '外包 / 派遣 / 实习' },
  unknown: { label: '不便透露' },
}

export const GRADE_TABLE = [
  { min: 85, grade: 'A', title: '双休落实良好', tone: 'good' },
  { min: 70, grade: 'B', title: '大体双休', tone: 'good' },
  { min: 50, grade: 'C', title: '双休不稳定', tone: 'warn' },
  { min: 30, grade: 'D', title: '常年单休', tone: 'bad' },
  { min: 0, grade: 'E', title: '休息权严重缺失', tone: 'bad' },
]

/** 各地展示用时区 */
const DISPLAY_TZ = 'Asia/Shanghai'

// ---------------------------------------------------------------- 文本处理

/** 全角转半角 */
function toHalfWidth(s) {
  return s.replace(/[\uFF01-\uFF5E]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/\u3000/g, ' ')
}

const COMPANY_SUFFIX = [
  '股份有限公司', '有限责任公司', '有限公司', '控股集团', '集团有限公司', '集团',
  '株式会社', '股份公司', '公司', '工厂', '制造厂', '厂',
  'incorporated', 'corporation', 'limited', 'holdings', 'group', 'inc', 'ltd', 'llc', 'corp', 'co',
]

/**
 * 归一化名称，用于去重与模糊匹配。
 * 例：「富士康工业互联网股份有限公司」→「富士康工业互联网」
 */
export function normalizeName(input) {
  let s = toHalfWidth(String(input ?? '')).toLowerCase()
  s = s.replace(/[\s\u200b]+/g, '')
  s = s.replace(/[·・.,，。、（）()\[\]【】{}<>《》""''"'`~!！?？:：;；\-—_+\/\\|*&#@$%^=]/g, '')
  // 去掉公司后缀（可能叠加，循环剥离）
  let changed = true
  while (changed) {
    changed = false
    for (const suf of COMPANY_SUFFIX) {
      if (s.length > suf.length + 1 && s.endsWith(suf)) {
        s = s.slice(0, -suf.length)
        changed = true
      }
    }
  }
  return s
}

/** 搜索用归一化：更宽松，仅去空白与标点 */
export function normalizeQuery(input) {
  return normalizeName(input)
}

/** 清理用户输入：去控制字符、压缩空白、截断长度 */
export function cleanText(input, maxLength = 500) {
  let s = String(input ?? '')
  // eslint-disable-next-line no-control-regex
  s = s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
  s = s.replace(/\r\n?/g, '\n')
  s = s.replace(/\n{4,}/g, '\n\n\n')
  s = s.replace(/[ \t]{3,}/g, '  ')
  s = s.trim()
  if (s.length > maxLength) s = s.slice(0, maxLength)
  return s
}

/** 单行清理（用于名称、标题类字段） */
export function cleanLine(input, maxLength = 120) {
  return cleanText(input, maxLength).replace(/\s*\n+\s*/g, ' ').trim()
}

/** HTML 转义（视图层兜底，模板引擎之外的地方使用） */
export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]))
}

// ---------------------------------------------------------------- 时间

export function nowIso() {
  return new Date().toISOString()
}

/** 由 ISO 时间戳生成展示用日期时间（北京时间） */
export function formatDateTime(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  try {
    return new Intl.DateTimeFormat('zh-CN', {
      timeZone: DISPLAY_TZ,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(d).replace(/\//g, '-')
  } catch {
    return d.toISOString().slice(0, 16).replace('T', ' ')
  }
}

export function formatDate(iso) {
  const full = formatDateTime(iso)
  return full === '—' ? full : full.slice(0, 10)
}

/** 相对时间：3 天前 */
export function relativeTime(iso) {
  if (!iso) return '—'
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return '—'
  const diff = Date.now() - t
  const min = Math.floor(diff / 60000)
  if (min < 1) return '刚刚'
  if (min < 60) return `${min} 分钟前`
  const hour = Math.floor(min / 60)
  if (hour < 24) return `${hour} 小时前`
  const day = Math.floor(hour / 24)
  if (day < 30) return `${day} 天前`
  const month = Math.floor(day / 30)
  if (month < 12) return `${month} 个月前`
  return `${Math.floor(month / 12)} 年前`
}

// ---------------------------------------------------------------- 隐私 / 哈希

/** 对 IP 加盐哈希，绝不保存明文 IP */
export async function hashIp(ip, salt = 'xiumuxuan') {
  const data = new TextEncoder().encode(`${salt}::${ip || '0.0.0.0'}`)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(digest)].slice(0, 12).map((b) => b.toString(16).padStart(2, '0')).join('')
}

// ---------------------------------------------------------------- 双休指数

const HALF_LIFE_DAYS = 400

/**
 * 根据该厂家的全部情报计算「双休指数」。
 *
 * - 时间衰减：半衰期 400 天，越新的情报权重越高
 * - 「说不清」不计入评分，但计入样本量
 *
 * 注：早期版本还按「信息来源」（本人亲历 / 亲友同事 / 公开招聘信息）
 * 再乘一个可信度权重，该维度已取消——所有情报现在按同等可信度对待，
 * 防刷改由频率限制、内容去重与「少于 3 条不给等级」的样本门槛承担。
 *
 * @returns {{
 *   score: number|null, grade: string|null, gradeTitle: string, tone: string,
 *   confidence: 'high'|'medium'|'low'|'insufficient',
 *   total: number, effective: number, verdictCounts: Record<string, number>,
 *   latestAt: string|null, firstAt: string|null, weightSum: number
 * }}
 */
export function computeIndex(reports = [], now = Date.now()) {
  let weightSum = 0
  let valueSum = 0
  let total = 0
  let effective = 0
  let latestAt = null
  let firstAt = null
  const verdictCounts = {}

  for (const r of reports) {
    if (r.status && r.status !== 'published') continue
    total += 1
    verdictCounts[r.verdict] = (verdictCounts[r.verdict] || 0) + 1

    const at = r.created_at
    if (at) {
      if (!latestAt || at > latestAt) latestAt = at
      if (!firstAt || at < firstAt) firstAt = at
    }

    const verdict = VERDICTS[r.verdict]
    if (!verdict || verdict.score == null) continue

    const ts = Date.parse(at)
    const ageDays = Number.isNaN(ts) ? 0 : Math.max(0, (now - ts) / 86400000)
    const w = Math.pow(0.5, ageDays / HALF_LIFE_DAYS)

    weightSum += w
    valueSum += w * verdict.score
    effective += 1
  }

  const score = weightSum > 0 ? Math.round((valueSum / weightSum) * 1000) / 10 : null
  const row = score == null ? null : GRADE_TABLE.find((g) => score >= g.min)

  let confidence = 'insufficient'
  if (effective >= 12) confidence = 'high'
  else if (effective >= 6) confidence = 'medium'
  else if (effective >= 3) confidence = 'low'

  return {
    score,
    grade: score == null || effective < 3 ? null : row.grade,
    gradeTitle: effective < 3 ? '样本不足' : (row ? row.title : '样本不足'),
    tone: score == null || effective < 3 ? 'muted' : row.tone,
    confidence,
    total,
    effective,
    verdictCounts,
    latestAt,
    firstAt,
    weightSum: Math.round(weightSum * 100) / 100,
  }
}

export const CONFIDENCE_LABEL = {
  high: '样本充足',
  medium: '样本中等',
  low: '样本偏少',
  insufficient: '样本不足',
}

// ---------------------------------------------------------------- 表单校验

const VERDICT_KEYS = Object.keys(VERDICTS)
const EMPLOYMENT_KEYS = Object.keys(EMPLOYMENTS)

/** 校验「双休情报」提交 */
export function validateReport(input) {
  const errors = []
  const data = {
    verdict: cleanLine(input.verdict, 32),
    schedule: cleanLine(input.schedule, 160),
    rest_days: parseFloatOrNull(input.rest_days),
    weekly_hours: parseFloatOrNull(input.weekly_hours),
    overtime: cleanLine(input.overtime, 160),
    make_up_work: input.make_up_work ? 1 : 0,
    position: cleanLine(input.position, 60),
    employment: cleanLine(input.employment, 24) || 'unknown',
    evidence: cleanLine(input.evidence, 300),
    detail: cleanText(input.detail, 1500),
  }

  if (!VERDICT_KEYS.includes(data.verdict)) errors.push('请选择「每周实际休息情况」')
  if (!EMPLOYMENT_KEYS.includes(data.employment)) errors.push('在职状态不正确')

  if (data.rest_days != null && (data.rest_days < 0 || data.rest_days > 7)) {
    errors.push('每周休息天数应在 0 到 7 之间')
  }
  if (data.weekly_hours != null && (data.weekly_hours < 0 || data.weekly_hours > 168)) {
    errors.push('每周工时应在 0 到 168 小时之间')
  }
  if (data.evidence && !/^https?:\/\//i.test(data.evidence)) {
    errors.push('佐证链接需以 http:// 或 https:// 开头')
  }
  // 补充说明是唯一能体现信息质量的地方，所有提交统一要求写够
  if (data.detail.length < 10) {
    errors.push('请在补充说明里至少写 10 个字：什么时候、什么部门、周末怎么安排')
  }
  if (data.detail.length > 1500) errors.push('补充说明过长')

  return { ok: errors.length === 0, errors, data }
}

/** 校验评论 */
export function validateComment(input) {
  const errors = []
  const data = {
    nickname: cleanLine(input.nickname, 24) || '匿名工友',
    content: cleanText(input.content, 1000),
  }
  if (data.content.length < 2) errors.push('评论内容太短')
  if (data.content.length > 1000) errors.push('评论过长（上限 1000 字）')
  return { ok: errors.length === 0, errors, data }
}

/** 校验游客登录昵称（无密码：昵称即身份） */
export function validateNickname(input) {
  const raw = cleanText(input, 200).replace(/\s*\n+\s*/g, ' ').trim()
  const errors = []
  if (raw.length === 0) errors.push('请填写一个昵称')
  else if (raw.length > 24) errors.push('昵称最多 24 个字')
  return { ok: errors.length === 0, errors, nickname: raw.slice(0, 24) }
}

/** 用户名允许的字符：中文、字母、数字、下划线、短横线 */
const USERNAME_RE = /^[A-Za-z0-9_\u4e00-\u9fa5-]{3,32}$/

/**
 * 校验「设置账号密码」。
 * 密码不做 cleanText（会改动字符），只限长度——用户输入的必须原样使用。
 */
export function validateCredentials(input) {
  const errors = []
  const username = cleanLine(input.username, 32)
  const password = String(input.password ?? '')
  const confirm = String(input.confirm ?? '')

  if (!username) errors.push('请填写用户名')
  else if (!USERNAME_RE.test(username)) {
    errors.push('用户名需 3–32 位，只能用中文、字母、数字、下划线或短横线')
  }

  if (password.length < 8) errors.push('密码至少 8 位')
  else if (password.length > 128) errors.push('密码不能超过 128 位')
  if (password !== confirm) errors.push('两次输入的密码不一致')

  return { ok: errors.length === 0, errors, username, password }
}

/** 校验登录表单：只查非空，具体错在哪不告诉提交者 */
export function validateLoginPassword(input) {
  const username = cleanLine(input.username, 64)
  const password = String(input.password ?? '')
  const errors = []
  if (!username || !password) errors.push('请填写用户名和密码')
  return { ok: errors.length === 0, errors, username, password }
}

/**
 * 校验「注册新账号」：一次填完用户名 + 密码 + 昵称。
 * 昵称留空时用用户名充当展示署名。
 */
export function validateRegistration(input) {
  const cred = validateCredentials(input)
  const errors = [...cred.errors]

  const nickname = cleanLine(input.nickname, 24) || cred.username
  if (nickname.length > 24) errors.push('昵称最多 24 个字')

  return {
    ok: errors.length === 0,
    errors,
    username: cred.username,
    password: cred.password,
    nickname,
  }
}

/** 校验厂家提交 */
export function validateCompany(input) {
  const errors = []
  const data = {
    name: cleanLine(input.name, 80),
    aliases: cleanLine(input.aliases, 200),
    industry: cleanLine(input.industry, 60),
    region: cleanLine(input.region, 60),
    website: cleanLine(input.website, 200),
    note: cleanText(input.note, 500),
  }
  if (data.name.length < 2) errors.push('厂家名称至少 2 个字')
  if (data.name.length > 80) errors.push('厂家名称过长')
  if (data.website && !/^https?:\/\//i.test(data.website)) errors.push('官网需以 http:// 或 https:// 开头')
  return { ok: errors.length === 0, errors, data, norm: normalizeName(data.name) }
}

/** 校验产品提交 */
export function validateProduct(input) {
  const errors = []
  const data = {
    name: cleanLine(input.name, 100),
    brand: cleanLine(input.brand, 60),
    category: cleanLine(input.category, 60),
    barcode: cleanLine(input.barcode, 40),
  }
  const companyId = parseIntOrNull(input.company_id)
  if (data.name.length < 1) errors.push('请填写产品名称')
  if (data.name.length > 100) errors.push('产品名称过长')
  if (!companyId) errors.push('请选择该产品的生产厂家')
  return { ok: errors.length === 0, errors, data, companyId, norm: normalizeName(data.name) }
}

function parseFloatOrNull(v) {
  if (v === null || v === undefined || String(v).trim() === '') return null
  const n = Number.parseFloat(String(v))
  return Number.isFinite(n) ? n : null
}

function parseIntOrNull(v) {
  if (v === null || v === undefined || String(v).trim() === '') return null
  const n = Number.parseInt(String(v), 10)
  return Number.isFinite(n) ? n : null
}

// ---------------------------------------------------------------- 限流

export const RATE_LIMITS = {
  report: { max: 5, windowMinutes: 60, label: '上传情报' },
  comment: { max: 12, windowMinutes: 60, label: '发表评论' },
  company: { max: 5, windowMinutes: 60, label: '新建厂家' },
  product: { max: 8, windowMinutes: 60, label: '提交产品' },
  login: { max: 10, windowMinutes: 60, label: '游客登录' },
  account_login: { max: 10, windowMinutes: 15, label: '账号登录' },
  account_set: { max: 5, windowMinutes: 60, label: '设置账号密码' },
  register: { max: 8, windowMinutes: 60, label: '注册账号' },
}

/**
 * 基于「IP 哈希 + 动作 + 时间窗」的计数限流。
 * 命中上限时返回 { ok:false }，调用方应给出友好提示。
 */
export async function checkRateLimit(db, ipHash, action) {
  const conf = RATE_LIMITS[action] || { max: 10, windowMinutes: 60 }
  const since = new Date(Date.now() - conf.windowMinutes * 60000).toISOString()

  const row = await db.first(
    'SELECT COUNT(*) AS n FROM rate_events WHERE ip_hash = ? AND action = ? AND created_at >= ?',
    [ipHash, action, since],
  )
  const used = Number(row?.n ?? 0)
  if (used >= conf.max) {
    return { ok: false, used, ...conf }
  }
  await db.run('INSERT INTO rate_events (ip_hash, action, created_at) VALUES (?, ?, ?)', [
    ipHash, action, nowIso(),
  ])
  // 偶发清理历史记录，避免表无限膨胀
  if (Math.random() < 0.02) {
    const cutoff = new Date(Date.now() - 86400000 * 3).toISOString()
    await db.run('DELETE FROM rate_events WHERE created_at < ?', [cutoff])
  }
  return { ok: true, used: used + 1, ...conf }
}

/**
 * 内容级去重：同一 IP 在同一厂家下、短时间内提交「实质相同」的内容才算重复。
 *
 * 刻意不做「同厂家同 IP 一律拒绝」——同一个人的情况本来就可能要补充多条
 * （不同年份、不同部门），一刀切会误伤真实贡献。防刷交给 checkRateLimit。
 *
 * @param {(row: any) => boolean} predicate 判断两条内容是否实质相同
 */
export async function hasRecentSubmission(db, table, companyId, ipHash, minutes, predicate) {
  const since = new Date(Date.now() - minutes * 60000).toISOString()
  const rows = await db.all(
    `SELECT * FROM ${table} WHERE company_id = ? AND ip_hash = ? AND created_at >= ? LIMIT 50`,
    [companyId, ipHash, since],
  )
  if (rows.length === 0) return false
  return rows.some(predicate)
}
