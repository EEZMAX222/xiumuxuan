/**
 * 休沐选 — 应用核心（路由 + 处理器）。
 *
 * 全部使用 Web 标准 Request/Response，因此同一份代码可以：
 *   - 跑在 Node（src/server.js 用 node:http 适配）
 *   - 跑在 Cloudflare Workers（src/worker.js 直接使用 fetch 签名）
 */
import { createRouter } from './router.js'
import { htmlResponse } from './html.js'
import { STATIC_ROUTES } from './assets.js'
import { checkGeo, blockedResponse } from './geo.js'
import {
  normalizeQuery, computeIndex, validateReport, validateComment, validateCompany,
  validateProduct, validateNickname, validateCredentials, validateLoginPassword,
  validateRegistration, checkRateLimit, hasRecentSubmission, hashIp, nowIso,
} from './logic.js'
import {
  homePage, searchPage, companyPage, newReportPage, newCompanyPage,
  newProductPage, aboutPage, notFoundPage, errorPage,
  loginPage, mePage, editCommentPage, accountPage,
} from './views.js'
import {
  resolveUser, createGuest, sessionCookie, clearSessionCookie,
  redirectWithCookie, safeNext, isSecureRequest, randomHex,
  resolveIterations, isUsernameTaken, setCredentials, verifyPassword,
  loginWithPassword, hasAccount,
} from './session.js'

// ---------------------------------------------------------------- 小工具

function toId(v) {
  const n = Number.parseInt(String(v ?? ''), 10)
  return Number.isFinite(n) && n > 0 ? n : null
}

function formValue(fd, key) {
  const v = fd.get(key)
  return typeof v === 'string' ? v : ''
}

/** 解析表单；非表单请求返回 null */
async function readForm(request) {
  const ct = (request.headers.get('content-type') || '').toLowerCase()
  if (!ct.includes('application/x-www-form-urlencoded') && !ct.includes('multipart/form-data')) {
    return null
  }
  try {
    return await request.formData()
  } catch {
    return null
  }
}

/** 转义 LIKE 中的通配符 */
function escapeLike(s) {
  return String(s).replace(/[\\%_]/g, (m) => `\\${m}`)
}

function redirect(location, status = 303) {
  return new Response(null, { status, headers: { location } })
}

/** 蜜罐命中：假装成功，实际丢弃（不消耗限流额度） */
function honeypotTripped(fd) {
  return formValue(fd, 'website_hp').trim().length > 0
}

/** 取哈希后的客户端 IP（隐私：不入库明文） */
async function clientHash(request, env) {
  const ip = request.headers.get('cf-connecting-ip')
    || request.headers.get('x-real-ip')
    || (request.headers.get('x-forwarded-for') || '').split(',')[0].trim()
    || '0.0.0.0'
  return hashIp(ip, String(env.IP_SALT || 'xiumuxuan-default-salt'))
}

/** 批量计算多个厂家的双休指数 */
async function loadIndexMap(db, ids) {
  const map = new Map()
  const uniq = [...new Set(ids.filter((x) => Number.isFinite(x)))]
  if (uniq.length === 0) return map
  const ph = uniq.map(() => '?').join(',')
  const rows = await db.all(
    `SELECT * FROM reports WHERE company_id IN (${ph}) AND status = 'published'
     ORDER BY created_at DESC LIMIT 5000`,
    uniq,
  )
  const bucket = new Map()
  for (const id of uniq) bucket.set(id, [])
  for (const r of rows) {
    if (!bucket.has(r.company_id)) bucket.set(r.company_id, [])
    bucket.get(r.company_id).push(r)
  }
  for (const [id, list] of bucket) map.set(id, computeIndex(list))
  return map
}

/** 下拉选择用的厂家列表 */
function listCompanies(db, limit = 1000) {
  return db.all('SELECT id, name, region FROM companies ORDER BY name LIMIT ?', [limit])
}

/** 站点统计 */
async function siteStats(db) {
  const row = await db.first(`SELECT
    (SELECT COUNT(*) FROM companies) AS companies,
    (SELECT COUNT(*) FROM products)  AS products,
    (SELECT COUNT(*) FROM reports WHERE status = 'published')  AS reports,
    (SELECT COUNT(*) FROM comments WHERE status = 'published') AS comments
  `)
  return {
    companies: Number(row?.companies ?? 0),
    products: Number(row?.products ?? 0),
    reports: Number(row?.reports ?? 0),
    comments: Number(row?.comments ?? 0),
  }
}

// ---------------------------------------------------------------- 应用

export function createApp({ db, env = {} }) {
  const router = createRouter()

  // ---------------- 首页 ----------------
  router.get('/', async (request, params, ctx) => {
    const url = new URL(request.url)
    const [stats, latest, ranked] = await Promise.all([
      siteStats(db),
      db.all(
        `SELECT r.*, c.name AS company_name FROM reports r
         JOIN companies c ON c.id = r.company_id
         WHERE r.status = 'published'
         ORDER BY r.created_at DESC LIMIT 10`,
      ),
      db.all(
        `SELECT c.id, COUNT(*) AS n FROM companies c
         JOIN reports r ON r.company_id = c.id AND r.status = 'published' AND r.verdict <> 'unknown'
         GROUP BY c.id HAVING n >= 3 ORDER BY n DESC LIMIT 200`,
      ),
    ])

    let topGood = []
    let topBad = []
    if (ranked.length) {
      const ids = ranked.map((r) => r.id)
      const ph = ids.map(() => '?').join(',')
      const companies = await db.all(`SELECT * FROM companies WHERE id IN (${ph})`, ids)
      const idxMap = await loadIndexMap(db, ids)
      const rows = companies
        .map((c) => ({ company: c, index: idxMap.get(c.id) }))
        .filter((r) => r.index && r.index.score != null && r.index.effective >= 3)
      topGood = [...rows].sort((a, b) => b.index.score - a.index.score).slice(0, 5)
      topBad = [...rows].sort((a, b) => a.index.score - b.index.score).slice(0, 5)
    }

    return htmlResponse(homePage({
      stats, topGood, topBad, latest, query: url.searchParams, user: ctx.user,
    }))
  })

  // ---------------- 搜索 ----------------
  router.get('/search', async (request, routeParams, ctx) => {
    const url = new URL(request.url)
    const params = url.searchParams
    const q = (params.get('q') || '').trim()
    if (!q) {
      return htmlResponse(searchPage({
        q: '', productHits: [], companyHits: [], query: params, user: ctx.user,
      }))
    }

    const norm = normalizeQuery(q)
    const likeNorm = `%${escapeLike(norm)}%`
    const likeRaw = `%${escapeLike(q)}%`

    const products = await db.all(
      `SELECT * FROM products
       WHERE norm_name LIKE ? ESCAPE '\\' OR name LIKE ? ESCAPE '\\' OR brand LIKE ? ESCAPE '\\'
       ORDER BY LENGTH(norm_name) ASC LIMIT 50`,
      [likeNorm, likeRaw, likeRaw],
    )

    const companies = await db.all(
      `SELECT * FROM companies
       WHERE norm_name LIKE ? ESCAPE '\\' OR name LIKE ? ESCAPE '\\' OR aliases LIKE ? ESCAPE '\\'
       ORDER BY LENGTH(norm_name) ASC LIMIT 30`,
      [likeNorm, likeRaw, likeRaw],
    )

    const companyIds = [
      ...products.map((p) => p.company_id),
      ...companies.map((c) => c.id),
    ]
    const idxMap = await loadIndexMap(db, companyIds)

    const missing = [...new Set(products.map((p) => p.company_id))]
      .filter((id) => !companies.some((c) => c.id === id))
    const extra = missing.length
      ? await db.all(`SELECT * FROM companies WHERE id IN (${missing.map(() => '?').join(',')})`, missing)
      : []
    const companyById = new Map([...companies, ...extra].map((c) => [c.id, c]))
    const shownCompanyIds = new Set(companies.map((c) => c.id))

    const productHits = products
      .map((p) => {
        const company = companyById.get(p.company_id)
        if (!company) return null
        return { product: p, company, index: idxMap.get(p.company_id) || computeIndex([]) }
      })
      .filter(Boolean)

    const companyHits = companies.map((c) => ({
      company: c,
      index: idxMap.get(c.id) || computeIndex([]),
    }))

    return htmlResponse(searchPage({
      q, productHits, companyHits, query: params, shownCompanyIds, user: ctx.user,
    }))
  })

  // ---------------- 厂家页 ----------------
  router.get('/company/:id', async (request, params, ctx) => {
    const url = new URL(request.url)
    const id = toId(params.id)
    if (!id) return notFound(request, ctx.user)

    const company = await db.first('SELECT * FROM companies WHERE id = ?', [id])
    if (!company) return notFound(request, ctx.user)

    const [reports, comments, products, counts] = await Promise.all([
      db.all(
        `SELECT * FROM reports WHERE company_id = ? AND status = 'published'
         ORDER BY created_at DESC LIMIT 200`,
        [id],
      ),
      db.all(
        `SELECT * FROM comments WHERE company_id = ? AND status = 'published'
         ORDER BY created_at DESC LIMIT 200`,
        [id],
      ),
      db.all('SELECT * FROM products WHERE company_id = ? ORDER BY id DESC LIMIT 100', [id]),
      // 精确计数（上面的列表有 LIMIT，不能拿 length 当删除影响面）
      db.first(
        `SELECT
           (SELECT COUNT(*) FROM reports  WHERE company_id = ?) AS reports,
           (SELECT COUNT(*) FROM comments WHERE company_id = ?) AS comments,
           (SELECT COUNT(*) FROM products WHERE company_id = ?) AS products`,
        [id, id, id],
      ),
    ])

    return htmlResponse(companyPage({
      company, index: computeIndex(reports), reports, comments, products, counts,
      query: url.searchParams, user: ctx.user,
    }))
  })

  // ---------------- 新建厂家 ----------------
  router.get('/company/new', async (request, params, ctx) => {
    const url = new URL(request.url)
    return htmlResponse(newCompanyPage({
      values: {},
      errors: [],
      query: url.searchParams,
      presetName: (url.searchParams.get('name') || '').slice(0, 80),
      user: ctx.user,
    }))
  })

  router.post('/companies', async (request, params, ctx) => {
    const fd = await readForm(request)
    if (!fd) return redirect('/company/new?err=bad_request')
    if (honeypotTripped(fd)) return redirect('/?ok=company_created')

    const raw = {
      name: formValue(fd, 'name'),
      aliases: formValue(fd, 'aliases'),
      industry: formValue(fd, 'industry'),
      region: formValue(fd, 'region'),
      website: formValue(fd, 'website'),
      note: formValue(fd, 'note'),
    }
    const { ok, errors, data, norm } = validateCompany(raw)
    const redirectTo = formValue(fd, 'redirect_to')

    if (!ok) {
      const url = new URL(request.url)
      return htmlResponse(newCompanyPage({
        values: raw, errors, query: url.searchParams, presetName: '', user: ctx.user,
      }), 400)
    }
    if (!norm) {
      const url = new URL(request.url)
      return htmlResponse(newCompanyPage({
        values: raw, errors: ['厂家名称无法识别，请换一个写法'],
        query: url.searchParams, presetName: '', user: ctx.user,
      }), 400)
    }

    const ipHash = await clientHash(request, env)

    // 已存在则直接复用，避免重复条目
    const existing = await db.first('SELECT * FROM companies WHERE norm_name = ?', [norm])
    if (existing) {
      const base = redirectTo === 'report'
        ? `/report/new?company_id=${existing.id}`
        : `/company/${existing.id}?ok=company_exists`
      return redirect(base)
    }

    const limited = await checkRateLimit(db, ipHash, 'company')
    if (!limited.ok) {
      const url = new URL(request.url)
      return htmlResponse(newCompanyPage({
        values: raw,
        errors: [`新建厂家过于频繁（每小时最多 ${limited.max} 个），请稍后再试。`],
        query: url.searchParams,
        presetName: '',
        user: ctx.user,
      }), 429)
    }

    const now = nowIso()
    const res = await db.run(
      `INSERT INTO companies (name, norm_name, aliases, industry, region, website, note,
                              created_at, updated_at, created_ip, user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [data.name, norm, data.aliases, data.industry, data.region, data.website, data.note,
        now, now, ipHash, ctx.user ? ctx.user.id : null],
    )
    const newId = res.lastRowId

    // 同一厂家下没有产品时，顺手把「同名厂家」也建不成产品，交由用户后续补充
    return redirect(redirectTo === 'report'
      ? `/report/new?company_id=${newId}&ok=company_created`
      : `/company/${newId}?ok=company_created`)
  })

  // ---------------- 新建产品关联 ----------------
  router.get('/product/new', async (request, params, ctx) => {
    const url = new URL(request.url)
    const companies = await listCompanies(db)
    return htmlResponse(newProductPage({
      companies,
      values: {},
      errors: [],
      query: url.searchParams,
      presetCompanyId: url.searchParams.get('company_id') || '',
      presetName: (url.searchParams.get('q') || '').slice(0, 100),
      user: ctx.user,
    }))
  })

  router.post('/products', async (request, params, ctx) => {
    const fd = await readForm(request)
    if (!fd) return redirect('/product/new?err=bad_request')
    if (honeypotTripped(fd)) return redirect('/?ok=product_created')

    const raw = {
      name: formValue(fd, 'name'),
      brand: formValue(fd, 'brand'),
      category: formValue(fd, 'category'),
      barcode: formValue(fd, 'barcode'),
      company_id: formValue(fd, 'company_id'),
    }
    const { ok, errors, data, companyId, norm } = validateProduct(raw)

    const company = companyId
      ? await db.first('SELECT * FROM companies WHERE id = ?', [companyId])
      : null
    if (companyId && !company) errors.push('选择的厂家不存在')
    if (!ok || !company || !norm) {
      const companies = await listCompanies(db)
      const url = new URL(request.url)
      return htmlResponse(newProductPage({
        companies, values: raw, errors, query: url.searchParams,
        presetCompanyId: raw.company_id, presetName: '', user: ctx.user,
      }), 400)
    }

    const ipHash = await clientHash(request, env)

    const exists = await db.first(
      'SELECT id FROM products WHERE norm_name = ? AND company_id = ?',
      [norm, company.id],
    )
    if (exists) return redirect(`/company/${company.id}?ok=product_created`)

    const limited = await checkRateLimit(db, ipHash, 'product')
    if (!limited.ok) {
      const companies = await listCompanies(db)
      const url = new URL(request.url)
      return htmlResponse(newProductPage({
        companies, values: raw,
        errors: [`提交过于频繁（每小时最多 ${limited.max} 条），请稍后再试。`],
        query: url.searchParams, presetCompanyId: raw.company_id, presetName: '', user: ctx.user,
      }), 429)
    }

    await db.run(
      `INSERT INTO products (name, norm_name, brand, category, company_id, barcode, created_at, created_ip, user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [data.name, norm, data.brand, data.category, company.id, data.barcode, nowIso(), ipHash,
        ctx.user ? ctx.user.id : null],
    )
    return redirect(`/company/${company.id}?ok=product_created`)
  })

  // ---------------- 上传双休情报 ----------------
  router.get('/report/new', async (request, params, ctx) => {
    const url = new URL(request.url)
    const companies = await listCompanies(db)
    const presetCompanyId = url.searchParams.get('company_id') || ''
    const presetName = (url.searchParams.get('q') || '').slice(0, 80)
    return htmlResponse(newReportPage({
      company: null,
      companies,
      values: { company_id: presetCompanyId },
      errors: [],
      query: url.searchParams,
      presetCompanyId,
      presetName,
      user: ctx.user,
    }))
  })

  router.post('/reports', async (request, params, ctx) => {
    const fd = await readForm(request)
    if (!fd) return redirect('/report/new?err=bad_request')
    if (honeypotTripped(fd)) return redirect('/?ok=report_created')

    const raw = {
      company_id: formValue(fd, 'company_id'),
      verdict: formValue(fd, 'verdict'),
      schedule: formValue(fd, 'schedule'),
      rest_days: formValue(fd, 'rest_days'),
      weekly_hours: formValue(fd, 'weekly_hours'),
      overtime: formValue(fd, 'overtime'),
      make_up_work: formValue(fd, 'make_up_work'),
      position: formValue(fd, 'position'),
      employment: formValue(fd, 'employment'),
      evidence: formValue(fd, 'evidence'),
      detail: formValue(fd, 'detail'),
    }

    const { ok, errors, data } = validateReport(raw)
    const companyId = toId(raw.company_id)
    const company = companyId
      ? await db.first('SELECT * FROM companies WHERE id = ?', [companyId])
      : null
    if (!company) errors.unshift('请选择这条情报对应的生产厂家')

    if (!ok || !company) {
      const companies = await listCompanies(db)
      const url = new URL(request.url)
      return htmlResponse(newReportPage({
        company: null, companies, values: raw, errors,
        query: url.searchParams, presetCompanyId: raw.company_id, presetName: '', user: ctx.user,
      }), 400)
    }

    const ipHash = await clientHash(request, env)

    const limited = await checkRateLimit(db, ipHash, 'report')
    if (!limited.ok) {
      const companies = await listCompanies(db)
      const url = new URL(request.url)
      return htmlResponse(newReportPage({
        company: null, companies, values: raw,
        errors: [`上传过于频繁（每小时最多 ${limited.max} 条），请稍后再试。`],
        query: url.searchParams, presetCompanyId: raw.company_id, presetName: '', user: ctx.user,
      }), 429)
    }

    const dup = await hasRecentSubmission(
      db, 'reports', company.id, ipHash, 15,
      (r) => r.verdict === data.verdict && String(r.detail || '') === data.detail,
    )
    if (dup) return redirect(`/company/${company.id}?err=duplicate`)

    await db.run(
      `INSERT INTO reports (company_id, verdict, schedule, rest_days, weekly_hours, overtime,
                            make_up_work, position, employment, evidence, detail,
                            created_at, ip_hash, status, user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'published', ?)`,
      [
        company.id, data.verdict, data.schedule, data.rest_days, data.weekly_hours, data.overtime,
        data.make_up_work, data.position, data.employment, data.evidence, data.detail,
        nowIso(), ipHash, ctx.user ? ctx.user.id : null,
      ],
    )
    return redirect(`/company/${company.id}?ok=report_created`)
  })

  // ---------------- 评论 ----------------
  router.post('/comments', async (request, params, ctx) => {
    const fd = await readForm(request)
    if (!fd) return redirect('/?err=bad_request')
    if (honeypotTripped(fd)) return redirect('/?ok=comment_created')

    const companyId = toId(formValue(fd, 'company_id'))
    const company = companyId
      ? await db.first('SELECT * FROM companies WHERE id = ?', [companyId])
      : null
    if (!company) return redirect('/?err=not_found')

    // 已登录时署名一律跟随身份（表单不再提供昵称输入框）
    const nicknameInput = ctx.user ? ctx.user.nickname : formValue(fd, 'nickname').trim()
    const { ok, errors, data } = validateComment({
      nickname: nicknameInput,
      content: formValue(fd, 'content'),
    })

    if (!ok) return redirect(`/company/${company.id}?err=bad_request`)

    const ipHash = await clientHash(request, env)

    const limited = await checkRateLimit(db, ipHash, 'comment')
    if (!limited.ok) return redirect(`/company/${company.id}?err=rate_limited`)

    const dup = await hasRecentSubmission(
      db, 'comments', company.id, ipHash, 5,
      (r) => String(r.content || '') === data.content,
    )
    if (dup) return redirect(`/company/${company.id}?err=duplicate`)

    await db.run(
      `INSERT INTO comments (company_id, parent_id, nickname, content, created_at, ip_hash, status, user_id)
       VALUES (?, NULL, ?, ?, ?, ?, 'published', ?)`,
      [company.id, data.nickname, data.content, nowIso(), ipHash, ctx.user ? ctx.user.id : null],
    )
    return redirect(`/company/${company.id}?ok=comment_created#comments`)
  })

  // ---------------- 游客登录 / 我的贡献 ----------------
  router.get('/login', async (request, params, ctx) => {
    const url = new URL(request.url)
    return htmlResponse(loginPage({
      values: {},
      errors: [],
      query: url.searchParams,
      next: safeNext(url.searchParams.get('next') || '/'),
      user: ctx.user,
    }))
  })

  router.post('/login', async (request, params, ctx) => {
    const fd = await readForm(request)
    if (!fd) return redirect('/login?err=bad_request')

    const next = safeNext(formValue(fd, 'next') || '/')
    if (honeypotTripped(fd)) return redirect(next)

    const rawNickname = formValue(fd, 'nickname')
    const { ok, errors, nickname } = validateNickname(rawNickname)
    if (!ok) {
      const url = new URL(request.url)
      return htmlResponse(loginPage({
        values: { nickname: rawNickname },
        errors, query: url.searchParams, next, user: ctx.user,
      }), 400)
    }

    const ipHash = await clientHash(request, env)
    const limited = await checkRateLimit(db, ipHash, 'login')
    if (!limited.ok) {
      const url = new URL(request.url)
      return htmlResponse(loginPage({
        values: { nickname },
        errors: [`登录过于频繁（每小时最多 ${limited.max} 次），请稍后再试。`],
        query: url.searchParams, next, user: ctx.user,
      }), 429)
    }

    const { token } = await createGuest(db, nickname, ipHash)
    // 换身份时顺带把旧的会话 cookie 覆盖掉（同名 cookie 直接替换）
    return redirectWithCookie(`${next}${next.includes('?') ? '&' : '?'}ok=logged_in`,
      sessionCookie(token, ctx.secure))
  })

  // ---------------- 注册（一步到位：建身份 + 挂账号密码） ----------------
  router.post('/register', async (request, params, ctx) => {
    const fd = await readForm(request)
    if (!fd) return redirect('/login?err=bad_request')

    const next = safeNext(formValue(fd, 'next') || '/')
    if (honeypotTripped(fd)) return redirect(next)

    const url = new URL(request.url)
    const submitted = {
      username: formValue(fd, 'username'),
      nickname: formValue(fd, 'nickname'),
      password: formValue(fd, 'password'),
      confirm: formValue(fd, 'confirm'),
    }
    const values = { username: submitted.username, nickname: submitted.nickname }

    const { ok, errors, username, password, nickname } = validateRegistration(submitted)
    if (!ok) {
      return htmlResponse(loginPage({
        values, errors, query: url.searchParams, next, user: ctx.user,
      }), 400)
    }

    if (await isUsernameTaken(db, username)) {
      return htmlResponse(loginPage({
        values,
        errors: [`用户名「${username}」已经被占用了，换一个吧。`],
        query: url.searchParams, next, user: ctx.user,
      }), 409)
    }

    const ipHash = await clientHash(request, env)
    const limited = await checkRateLimit(db, ipHash, 'register')
    if (!limited.ok) {
      return htmlResponse(loginPage({
        values,
        errors: [`注册过于频繁（每小时最多 ${limited.max} 个），请稍后再试。`],
        query: url.searchParams, next, user: ctx.user,
      }), 429)
    }

    // 先建身份，再立刻挂上账号密码——用户不需要「先游客、再补设」两步走
    const { id, token } = await createGuest(db, nickname, ipHash)
    await setCredentials(db, id, username, password, resolveIterations(env))

    return redirectWithCookie(
      `${next}${next.includes('?') ? '&' : '?'}ok=account_created`,
      sessionCookie(token, ctx.secure),
    )
  })

  router.post('/logout', async (request, params, ctx) => {
    // 服务端撤销：把 token 换成一个随机值，已下发的 cookie 立刻失效。
    // 本站没有密码，所以这等于永久放弃这个身份——内容仍然保留，但无法再管理。
    // 前端按钮上有对应的确认提示，避免误点。
    if (ctx.user) {
      await db.run('UPDATE users SET token_hash = ? WHERE id = ?', [randomHex(32), ctx.user.id])
    }
    const res = redirect('/?ok=logged_out')
    res.headers.append('set-cookie', clearSessionCookie())
    return res
  })

  router.get('/me', async (request, params, ctx) => {
    if (!ctx.user) return redirect('/login?next=%2Fme')
    const url = new URL(request.url)
    const [reports, comments, products, companies] = await Promise.all([
      db.all(
        `SELECT r.*, c.name AS company_name FROM reports r
         JOIN companies c ON c.id = r.company_id
         WHERE r.user_id = ? ORDER BY r.created_at DESC LIMIT 200`,
        [ctx.user.id],
      ),
      db.all(
        `SELECT cm.*, c.name AS company_name FROM comments cm
         JOIN companies c ON c.id = cm.company_id
         WHERE cm.user_id = ? ORDER BY cm.created_at DESC LIMIT 200`,
        [ctx.user.id],
      ),
      db.all(
        `SELECT p.*, c.name AS company_name FROM products p
         JOIN companies c ON c.id = p.company_id
         WHERE p.user_id = ? ORDER BY p.created_at DESC LIMIT 200`,
        [ctx.user.id],
      ),
      db.all(
        `SELECT c.*,
                (SELECT COUNT(*) FROM reports  r  WHERE r.company_id  = c.id) AS report_count,
                (SELECT COUNT(*) FROM comments cm WHERE cm.company_id = c.id) AS comment_count,
                (SELECT COUNT(*) FROM products p  WHERE p.company_id  = c.id) AS product_count
           FROM companies c
          WHERE c.user_id = ? ORDER BY c.created_at DESC LIMIT 200`,
        [ctx.user.id],
      ),
    ])
    return htmlResponse(mePage({
      user: ctx.user, reports, comments, products, companies, query: url.searchParams,
    }))
  })

  // ---------------- 账号密码 ----------------
  router.post('/login/password', async (request, params, ctx) => {
    const fd = await readForm(request)
    if (!fd) return redirect('/login?err=bad_request')

    const next = safeNext(formValue(fd, 'next') || '/')
    if (honeypotTripped(fd)) return redirect(next)

    const url = new URL(request.url)
    const { ok, errors, username, password } = validateLoginPassword({
      username: formValue(fd, 'username'),
      password: formValue(fd, 'password'),
    })
    if (!ok) {
      return htmlResponse(loginPage({
        values: { username }, errors, query: url.searchParams, next, user: ctx.user,
      }), 400)
    }

    const ipHash = await clientHash(request, env)
    const limited = await checkRateLimit(db, ipHash, 'account_login')
    if (!limited.ok) {
      return htmlResponse(loginPage({
        values: { username },
        errors: [`尝试过于频繁，请 ${limited.windowMinutes} 分钟后再试。`],
        query: url.searchParams, next, user: ctx.user,
      }), 429)
    }

    const result = await loginWithPassword(db, username, password, resolveIterations(env))
    if (!result) {
      // 刻意不区分「用户名不存在」与「密码错误」
      return htmlResponse(loginPage({
        values: { username },
        errors: ['用户名或密码不正确。'],
        query: url.searchParams, next, user: ctx.user,
      }), 401)
    }

    return redirectWithCookie(
      `${next}${next.includes('?') ? '&' : '?'}ok=logged_in`,
      sessionCookie(result.token, ctx.secure),
    )
  })

  router.get('/account', async (request, params, ctx) => {
    const url = new URL(request.url)
    if (!ctx.user) return redirect(`/login?next=${encodeURIComponent('/account')}`)
    return htmlResponse(accountPage({
      user: ctx.user, errors: [], values: {}, query: url.searchParams,
    }))
  })

  router.post('/account', async (request, params, ctx) => {
    if (!ctx.user) return redirect(`/login?next=${encodeURIComponent('/account')}`)

    const fd = await readForm(request)
    if (!fd) return redirect('/account?err=bad_request')
    if (honeypotTripped(fd)) return redirect('/account?ok=account_created')

    const url = new URL(request.url)
    const ipHash = await clientHash(request, env)
    const alreadyHas = hasAccount(ctx.user)

    // 已设置过的用户只能改密码（用户名固定，避免身份混乱）
    if (alreadyHas) {
      const currentPassword = String(formValue(fd, 'current_password') ?? '')
      if (!(await verifyPassword(ctx.user, currentPassword))) {
        return htmlResponse(accountPage({
          user: ctx.user, errors: ['当前密码不正确。'], values: {}, query: url.searchParams,
        }), 400)
      }

      const { ok, errors, password } = validateCredentials({
        username: ctx.user.username,
        password: formValue(fd, 'password'),
        confirm: formValue(fd, 'confirm'),
      })
      if (!ok) {
        return htmlResponse(accountPage({
          user: ctx.user, errors, values: {}, query: url.searchParams,
        }), 400)
      }

      const limited = await checkRateLimit(db, ipHash, 'account_set')
      if (!limited.ok) {
        return htmlResponse(accountPage({
          user: ctx.user,
          errors: ['修改密码过于频繁，请稍后再试。'],
          values: {}, query: url.searchParams,
        }), 429)
      }

      await setCredentials(db, ctx.user.id, ctx.user.username, password, resolveIterations(env))
      return redirect('/account?ok=password_changed')
    }

    // 首次设置账号密码
    const submitted = formValue(fd, 'username')
    const { ok, errors, username, password } = validateCredentials({
      username: submitted,
      password: formValue(fd, 'password'),
      confirm: formValue(fd, 'confirm'),
    })
    if (!ok) {
      return htmlResponse(accountPage({
        user: ctx.user, errors, values: { username: submitted }, query: url.searchParams,
      }), 400)
    }
    if (await isUsernameTaken(db, username)) {
      return htmlResponse(accountPage({
        user: ctx.user,
        errors: [`用户名「${username}」已经被占用了，换一个吧。`],
        values: { username }, query: url.searchParams,
      }), 409)
    }

    const limited = await checkRateLimit(db, ipHash, 'account_set')
    if (!limited.ok) {
      return htmlResponse(accountPage({
        user: ctx.user,
        errors: ['操作过于频繁，请稍后再试。'],
        values: { username }, query: url.searchParams,
      }), 429)
    }

    await setCredentials(db, ctx.user.id, username, password, resolveIterations(env))
    return redirect('/account?ok=account_created')
  })

  // ---------------- 管理自己发布的内容 ----------------
  router.get('/comments/:id/edit', async (request, params, ctx) => {
    const url = new URL(request.url)
    const id = toId(params.id)
    const comment = id ? await db.first('SELECT * FROM comments WHERE id = ?', [id]) : null
    if (!comment) return notFound(request, ctx.user)
    if (!ctx.user) return redirect(`/login?next=${encodeURIComponent(`/comments/${id}/edit`)}`)
    if (Number(comment.user_id) !== Number(ctx.user.id)) {
      return redirect(`/company/${comment.company_id}?err=forbidden`)
    }
    const company = await db.first('SELECT * FROM companies WHERE id = ?', [comment.company_id])
    if (!company) return notFound(request, ctx.user)
    return htmlResponse(editCommentPage({
      comment, company, values: {}, errors: [], query: url.searchParams, user: ctx.user,
    }))
  })

  router.post('/comments/:id/edit', async (request, params, ctx) => {
    const id = toId(params.id)
    const comment = id ? await db.first('SELECT * FROM comments WHERE id = ?', [id]) : null
    if (!comment) return notFound(request, ctx.user)
    if (!ctx.user) return redirect(`/login?next=${encodeURIComponent(`/comments/${id}/edit`)}`)
    if (Number(comment.user_id) !== Number(ctx.user.id)) {
      return redirect(`/company/${comment.company_id}?err=forbidden`)
    }

    const fd = await readForm(request)
    if (!fd) return redirect(`/company/${comment.company_id}?err=bad_request`)
    if (honeypotTripped(fd)) return redirect(`/company/${comment.company_id}?ok=comment_updated`)

    const submitted = {
      nickname: ctx.user.nickname,   // 署名跟随身份，不允许在编辑页改署名
      content: formValue(fd, 'content'),
    }
    const { ok, errors, data } = validateComment(submitted)
    const company = await db.first('SELECT * FROM companies WHERE id = ?', [comment.company_id])

    if (!ok) {
      return htmlResponse(editCommentPage({
        comment, company, values: submitted, errors,
        query: new URL(request.url).searchParams, user: ctx.user,
      }), 400)
    }

    await db.run(
      'UPDATE comments SET nickname = ?, content = ? WHERE id = ? AND user_id = ?',
      [data.nickname, data.content, comment.id, ctx.user.id],
    )
    return redirect(`/company/${comment.company_id}?ok=comment_updated#comments`)
  })

  router.post('/comments/:id/delete', async (request, params, ctx) => {
    const id = toId(params.id)
    const comment = id ? await db.first('SELECT * FROM comments WHERE id = ?', [id]) : null
    if (!comment) return notFound(request, ctx.user)
    if (!ctx.user) return redirect(`/login?next=${encodeURIComponent(`/company/${comment.company_id}`)}`)
    if (Number(comment.user_id) !== Number(ctx.user.id)) {
      return redirect(`/company/${comment.company_id}?err=forbidden`)
    }
    await db.run('DELETE FROM comments WHERE id = ? AND user_id = ?', [comment.id, ctx.user.id])
    return redirect(`/company/${comment.company_id}?ok=comment_deleted#comments`)
  })

  router.post('/reports/:id/delete', async (request, params, ctx) => {
    const id = toId(params.id)
    const report = id ? await db.first('SELECT * FROM reports WHERE id = ?', [id]) : null
    if (!report) return notFound(request, ctx.user)
    if (!ctx.user) return redirect(`/login?next=${encodeURIComponent(`/company/${report.company_id}`)}`)
    if (Number(report.user_id) !== Number(ctx.user.id)) {
      return redirect(`/company/${report.company_id}?err=forbidden`)
    }
    await db.run('DELETE FROM reports WHERE id = ? AND user_id = ?', [report.id, ctx.user.id])
    return redirect(`/company/${report.company_id}?ok=report_deleted`)
  })

  router.post('/products/:id/delete', async (request, params, ctx) => {
    const id = toId(params.id)
    const product = id ? await db.first('SELECT * FROM products WHERE id = ?', [id]) : null
    if (!product) return notFound(request, ctx.user)
    if (!ctx.user) return redirect(`/login?next=${encodeURIComponent('/me')}`)
    if (Number(product.user_id) !== Number(ctx.user.id)) {
      return redirect('/me?err=forbidden')
    }
    await db.run('DELETE FROM products WHERE id = ? AND user_id = ?', [product.id, ctx.user.id])
    return redirect('/me?ok=product_deleted')
  })

  // 删除自己建立的厂家。会连带删除挂在它下面的情报、评论与产品关联，
  // 其中可能包含其他人的贡献——页面上会先把影响面显示出来。
  router.post('/companies/:id/delete', async (request, params, ctx) => {
    const id = toId(params.id)
    const company = id ? await db.first('SELECT * FROM companies WHERE id = ?', [id]) : null
    if (!company) return notFound(request, ctx.user)
    if (!ctx.user) return redirect(`/login?next=${encodeURIComponent(`/company/${company.id}`)}`)
    if (Number(company.user_id) !== Number(ctx.user.id)) {
      return redirect(`/company/${company.id}?err=forbidden`)
    }

    // 按顺序显式删除子表，不依赖 ON DELETE CASCADE 是否真的开启
    await db.run('DELETE FROM comments  WHERE company_id = ?', [company.id])
    await db.run('DELETE FROM reports   WHERE company_id = ?', [company.id])
    await db.run('DELETE FROM products  WHERE company_id = ?', [company.id])
    await db.run('DELETE FROM companies WHERE id = ? AND user_id = ?', [company.id, ctx.user.id])

    return redirect('/me?ok=company_deleted')
  })

  // ---------------- 关于 / 健康检查 ----------------
  router.get('/about', async (request, params, ctx) => {
    const url = new URL(request.url)
    const stats = await siteStats(db)
    return htmlResponse(aboutPage({ query: url.searchParams, stats, user: ctx.user }))
  })

  router.get('/healthz', async () => {
    const row = await db.first('SELECT COUNT(*) AS n FROM companies')
    return new Response(JSON.stringify({ ok: true, companies: Number(row?.n ?? 0) }), {
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
    })
  })

  // ---------------- 兜底 ----------------
  function notFound(request, user = null) {
    const url = new URL(request.url)
    return htmlResponse(notFoundPage({ query: url.searchParams, user }), 404)
  }

  async function handle(request) {
    const url = new URL(request.url)

    // 1) 来源地区访问控制
    const geo = checkGeo(request, env)
    if (!geo.allowed) {
      // 客户端只拿到一个不含任何信息的 403；诊断线索留在服务端日志里
      console.log(`[geo] 拒绝 country=${geo.country || 'UNKNOWN'} reason=${geo.reason} path=${url.pathname}`)
      return blockedResponse()
    }

    // 2) 内置静态资源
    const asset = STATIC_ROUTES[url.pathname]
    if (asset) {
      return new Response(asset.body, {
        headers: {
          'content-type': asset.type,
          'cache-control': 'public, max-age=3600',
        },
      })
    }

    // 3) 路由
    const matched = router.match(request.method, url.pathname)
    if (!matched) return notFound(request)
    if (matched.methodNotAllowed) {
      return new Response('405 Method Not Allowed', {
        status: 405,
        headers: { allow: (matched.allow || []).join(', '), 'content-type': 'text/plain; charset=utf-8' },
      })
    }

    // 4) 解析游客身份（静态资源已在上面短路，不必为它们查库）
    let user = null
    try {
      user = await resolveUser(db, request)
    } catch (err) {
      console.error('[休沐选] 解析会话失败:', err && err.message ? err.message : err)
    }
    const ctx = { user, secure: isSecureRequest(request) }

    try {
      return await matched.handler(request, matched.params, ctx)
    } catch (err) {
      console.error('[休沐选] 处理请求出错:', err && err.stack ? err.stack : err)
      const message = env.NODE_ENV === 'production'
        ? '（详细错误已记录在服务端日志）'
        : String((err && err.stack) || err)
      return htmlResponse(errorPage({ message }), 500)
    }
  }

  handle.router = router
  return handle
}

export { notFoundPage }
