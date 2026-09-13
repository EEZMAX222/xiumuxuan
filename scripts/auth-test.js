/**
 * 游客登录（guest session）端到端测试。
 *
 * 覆盖：创建身份、会话 cookie、内容归属、编辑、删除、
 *       越权保护、开放重定向防护、登出、数据库迁移。
 *
 * 用法：先 `npm start`，再 `node scripts/auth-test.js`
 */

const BASE = process.env.BASE || 'http://127.0.0.1:8787'
const COOKIE = 'xmx_session'

let passed = 0
let failed = 0
const failures = []

function check(name, cond, detail = '') {
  if (cond) {
    passed += 1
    console.log(`  ✓ ${name}`)
  } else {
    failed += 1
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`)
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

async function get(path, cookie) {
  const headers = cookie ? { cookie } : {}
  return fetch(`${BASE}${path}`, { redirect: 'manual', headers })
}

async function post(path, fields, cookie) {
  const headers = { 'content-type': 'application/x-www-form-urlencoded' }
  if (cookie) headers.cookie = cookie
  return fetch(`${BASE}${path}`, {
    method: 'POST',
    redirect: 'manual',
    headers,
    body: new URLSearchParams(fields),
  })
}

/** 从响应里取出会话 cookie（只保留 name=value 部分） */
function sessionCookieOf(res) {
  const all = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : []
  for (const line of all) {
    if (line.startsWith(`${COOKIE}=`)) {
      const value = line.split(';')[0].slice(COOKIE.length + 1)
      if (value) return { pair: `${COOKIE}=${value}`, raw: line }
    }
  }
  return null
}

function locationOf(res) {
  return res.headers.get('location') || ''
}

async function main() {
  console.log(`\n休沐选 · 游客登录测试  目标：${BASE}\n`)
  const stamp = Date.now().toString().slice(-6)

  // ---------------------------------------------------------- 1. 数据库迁移
  console.log('[1] 数据库迁移与前置准备')
  let companyId = null
  {
    const { createSqliteAdapter } = await import('../src/db-sqlite.js')
    const db = await createSqliteAdapter(process.env.DB_PATH || './data/xiumuxuan.db')
    const tables = (await db.all("SELECT name FROM sqlite_master WHERE type='table'")).map((r) => r.name)
    check('users 表已建立', tables.includes('users'), tables.join(','))

    for (const t of ['reports', 'comments', 'products']) {
      const cols = await db.all(`PRAGMA table_info(${t})`)
      check(`${t} 表已补上 user_id 列`, cols.some((c) => c.name === 'user_id'))
    }

    const reportCols = await db.all('PRAGMA table_info(reports)')
    check('reports 表不再有 source 列（信息来源已取消）',
      !reportCols.some((c) => c.name === 'source'))

    // 限流记录会跨测试轮次累积，导致后续轮次收不到 cookie、结果不可复现。
    // 测试只关心限流「是否会触发」，不关心历史计数，所以先清空。
    await db.exec('DELETE FROM rate_events;')
    db.close()

    // 空库需要先有一个厂家，后续评论测试才有挂靠对象
    const created = await post('/companies', {
      name: `登录测试厂家${stamp}有限公司`, region: '测试',
    })
    companyId = Number((/\/company\/(\d+)/.exec(locationOf(created)) || [])[1]) || null
    check('创建测试厂家成功', companyId != null, locationOf(created))
  }

  // ---------------------------------------------------------- 2. 匿名状态
  console.log('\n[2] 未登录状态')
  {
    const res = await get('/login')
    const html = await res.text()
    check('GET /login 返回 200', res.status === 200, `实际 ${res.status}`)
    check('登录页同时提供注册、登录、游客三个入口',
      html.includes('注册新账号') && html.includes('已有账号') && html.includes('不注册，直接开始'))
    check('登录页包含昵称输入框', html.includes('name="nickname"'))
    check('登录页包含用户名/密码输入框',
      html.includes('name="username"') && html.includes('type="password"'))
    check('登录页说明共有三种方式', html.includes('三种方式'))

    const me = await get('/me')
    check('未登录访问 /me 被引导去登录', me.status === 303 && locationOf(me).startsWith('/login'),
      `${me.status} ${locationOf(me)}`)

    const home = await get('/')
    const homeHtml = await home.text()
    check('未登录首页不显示身份胶囊', !homeHtml.includes('class="user-chip"'))
    check('未登录时顶栏有登录入口', homeHtml.includes('href="/login"'))
  }

  // ---------------------------------------------------------- 3. 创建游客身份
  console.log('\n[3] 创建游客身份')
  const nickname = `测试工友${stamp}`
  let cookie = null
  {
    const empty = await post('/login', { nickname: '   ' })
    check('空昵称被拒绝（400）', empty.status === 400, `实际 ${empty.status}`)

    const res = await post('/login', { nickname, next: '/me' })
    check('POST /login 返回 303', res.status === 303, `实际 ${res.status}`)
    const sc = sessionCookieOf(res)
    check('响应下发了会话 cookie', sc != null)
    check('cookie 带 HttpOnly', sc != null && /HttpOnly/i.test(sc.raw), sc && sc.raw)
    check('cookie 带 SameSite=Lax', sc != null && /SameSite=Lax/i.test(sc.raw))
    check('登录后跳转到 next 指定页面', locationOf(res).startsWith('/me'), locationOf(res))
    cookie = sc ? sc.pair : null

    const me = await get('/me', cookie)
    const meHtml = await me.text()
    check('带 cookie 访问 /me 返回 200', me.status === 200, `实际 ${me.status}`)
    check('/me 显示昵称', meHtml.includes(nickname))
    check('/me 显示「我的贡献」', meHtml.includes('我的贡献'))

    const home = await get('/', cookie)
    const homeHtml = await home.text()
    check('已登录首页显示身份胶囊', homeHtml.includes('class="user-chip"'))
    check('首页顶栏显示昵称', homeHtml.includes(nickname))
  }

  // ---------------------------------------------------------- 4. 开放重定向防护
  console.log('\n[4] 开放重定向防护')
  {
    const evil = await post('/login', { nickname: `重定向${stamp}`, next: '//evil.example.com' })
    check('next 为协议相对地址时被丢弃', locationOf(evil).startsWith('/'), locationOf(evil))

    const abs = await post('/login', { nickname: `重定向2${stamp}`, next: 'https://evil.example.com' })
    check('next 为绝对外链时被丢弃', locationOf(abs).startsWith('/'), locationOf(abs))
  }

  // ---------------------------------------------------------- 5. 内容归属
  console.log('\n[5] 内容归属与标记')
  let commentId = null
  const marker = `登录态评论-${stamp}`
  {
    const res = await post('/comments', {
      company_id: companyId, nickname: '我应该被身份昵称覆盖', content: `${marker} 我在这家做过。`,
    }, cookie)
    check('登录后发表评论成功（303）', res.status === 303, `实际 ${res.status}`)

    const page = await get(`/company/${companyId}`, cookie)
    const html = await page.text()
    check('评论出现在厂家页', html.includes(marker))
    check('自己的评论带「我发布的」标记', html.includes('我发布的'))
    check('自己的评论有编辑入口', html.includes('/edit'))
    check('自己的评论有删除入口', html.includes('/delete'))
    check('署名使用身份昵称而非表单昵称', html.includes(nickname) && !html.includes('我应该被身份昵称覆盖'))

    const m = /\/comments\/(\d+)\/edit/.exec(html)
    commentId = m ? Number(m[1]) : null
    check('能从页面解析出评论 id', commentId != null)

    const anon = await get(`/company/${companyId}`)
    const anonHtml = await anon.text()
    check('未登录访客看不到编辑/删除按钮', !anonHtml.includes(`/comments/${commentId}/edit`))
    check('未登录访客仍能看到评论内容', anonHtml.includes(marker))

    const me = await get('/me', cookie)
    const meHtml = await me.text()
    check('/me 列出我发布的评论', meHtml.includes(marker))
  }

  // ---------------------------------------------------------- 6. 编辑
  console.log('\n[6] 编辑自己的评论')
  {
    const form = await get(`/comments/${commentId}/edit`, cookie)
    const formHtml = await form.text()
    check('GET 编辑页返回 200', form.status === 200, `实际 ${form.status}`)
    check('编辑页回填原内容', formHtml.includes(marker))

    const updated = `${marker}（已修改）`
    const res = await post(`/comments/${commentId}/edit`, {
      nickname, content: updated,
    }, cookie)
    check('POST 编辑返回 303', res.status === 303, `实际 ${res.status}`)

    const page = await get(`/company/${companyId}`, cookie)
    const html = await page.text()
    check('页面显示修改后的内容', html.includes('（已修改）'))
    check('旧内容已被替换', !html.includes(`${marker} 我在这家做过。`))

    const tooShort = await post(`/comments/${commentId}/edit`, { nickname, content: 'x' }, cookie)
    check('编辑成过短内容被拒绝（400）', tooShort.status === 400, `实际 ${tooShort.status}`)
  }

  // ---------------------------------------------------------- 7. 越权保护
  console.log('\n[7] 越权保护')
  {
    const noCookie = await post(`/comments/${commentId}/delete`, {})
    check('未登录无法删除（303 去登录）',
      noCookie.status === 303 && locationOf(noCookie).startsWith('/login'), locationOf(noCookie))

    const otherLogin = await post('/login', { nickname: `另一个${stamp}`, next: '/' })
    const otherCookie = sessionCookieOf(otherLogin)
    const other = await post(`/comments/${commentId}/delete`, {}, otherCookie ? otherCookie.pair : null)
    check('他人身份删除被拒（forbidden）',
      other.status === 303 && locationOf(other).includes('err=forbidden'), locationOf(other))

    const still = await get(`/company/${companyId}`, cookie)
    check('越权删除后评论仍在', (await still.text()).includes('（已修改）'))

    const fakeReport = await post('/reports/999999/delete', {}, cookie)
    check('删除不存在的情报返回 404', fakeReport.status === 404, `实际 ${fakeReport.status}`)
  }

  // ---------------------------------------------------------- 8. 删除
  console.log('\n[8] 删除自己的内容')
  {
    const res = await post(`/comments/${commentId}/delete`, {}, cookie)
    check('删除自己的评论成功（303）', res.status === 303, `实际 ${res.status}`)
    check('带删除成功提示', locationOf(res).includes('ok=comment_deleted'), locationOf(res))

    const page = await get(`/company/${companyId}`, cookie)
    check('评论已从页面消失', !(await page.text()).includes(marker))
  }

  // ---------------------------------------------------------- 9. 登出
  console.log('\n[9] 登出')
  {
    const res = await post('/logout', {}, cookie)
    check('POST /logout 返回 303', res.status === 303, `实际 ${res.status}`)
    const cleared = (typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [])
      .find((c) => c.startsWith(`${COOKIE}=`))
    check('登出清除了会话 cookie', cleared != null && /Max-Age=0/.test(cleared), cleared || '未下发')

    const me = await get('/me', cookie)
    check('登出后原 cookie 失效', me.status === 303 && locationOf(me).startsWith('/login'),
      `${me.status} ${locationOf(me)}`)

    const bad = await get('/me', `${COOKIE}=deadbeef`)
    check('伪造的 cookie 不被接受', bad.status === 303 && locationOf(bad).startsWith('/login'))
  }

  // ---------------------------------------------------------- 10. 密码学细节
  console.log('\n[10] 令牌与哈希')
  {
    const { createSqliteAdapter } = await import('../src/db-sqlite.js')
    const db = await createSqliteAdapter(process.env.DB_PATH || './data/xiumuxuan.db')
    const row = await db.first('SELECT token_hash FROM users ORDER BY id DESC LIMIT 1')
    db.close()
    check('数据库存的是 64 位十六进制哈希而非明文令牌',
      /^[a-f0-9]{64}$/.test(String(row?.token_hash || '')), String(row?.token_hash || '').slice(0, 20))
  }

  // ---------------------------------------------------------- 11. 设置账号密码
  console.log('\n[11] 设置账号密码')
  const accountName = `acct${stamp}`
  const accountPass = 'TestPass12345'
  const productName = `账号测试产品${stamp}`
  const recoveredMarker = `身份恢复验证-${stamp}`
  let acctCookie = null
  let productId = null
  {
    // [9] 已经登出，这里需要一个全新的游客身份来做账号测试
    const fresh = await post('/login', { nickname: `账号测试${stamp}`, next: '/' })
    const freshCookie = sessionCookieOf(fresh)
    check('准备一个用于账号测试的游客身份', freshCookie != null)
    acctCookie = freshCookie ? freshCookie.pair : null

    const acc = await get('/account', acctCookie)
    const accHtml = await acc.text()
    check('GET /account 返回 200', acc.status === 200, `实际 ${acc.status}`)
    check('未设账号时显示「设置账号密码」', accHtml.includes('设置账号密码'))

    const tooShort = await post('/account', {
      mode: 'create', username: accountName, password: 'short', confirm: 'short',
    }, acctCookie)
    check('密码少于 8 位被拒绝（400）', tooShort.status === 400, `实际 ${tooShort.status}`)

    const mismatch = await post('/account', {
      mode: 'create', username: accountName, password: accountPass, confirm: `${accountPass}x`,
    }, acctCookie)
    check('两次密码不一致被拒绝（400）', mismatch.status === 400, `实际 ${mismatch.status}`)

    const badName = await post('/account', {
      mode: 'create', username: 'a', password: accountPass, confirm: accountPass,
    }, acctCookie)
    check('用户名过短被拒绝（400）', badName.status === 400, `实际 ${badName.status}`)

    const badName2 = await post('/account', {
      mode: 'create', username: '带 空格 的名字', password: accountPass, confirm: accountPass,
    }, acctCookie)
    check('含非法字符的用户名被拒绝（400）', badName2.status === 400, `实际 ${badName2.status}`)

    // 先留下评论与产品，供后面验证「恢复身份后仍能管理自己的内容」
    await post('/comments', {
      company_id: companyId, content: `${recoveredMarker} 这条评论用来验证身份恢复后仍可管理。`,
    }, acctCookie)
    const prod = await post('/products', {
      name: productName, brand: '测试', category: '测试', company_id: companyId,
    }, acctCookie)
    check('提交测试产品成功', prod.status === 303, `实际 ${prod.status}`)
    const meBefore = await (await get('/me', acctCookie)).text()
    const pm = /\/products\/(\d+)\/delete/.exec(meBefore)
    productId = pm ? Number(pm[1]) : null
    check('「我的贡献」列出该产品且带删除入口', productId != null)

    const set = await post('/account', {
      mode: 'create', username: accountName, password: accountPass, confirm: accountPass,
    }, acctCookie)
    check('设置账号成功（303）', set.status === 303, `实际 ${set.status}`)
    check('跳转带成功提示', locationOf(set).includes('ok=account_created'), locationOf(set))

    const acc2Html = await (await get('/account', acctCookie)).text()
    check('账号页显示用户名', acc2Html.includes(accountName))
    check('账号页切换为「修改密码」模式', acc2Html.includes('修改密码'))
    check('账号页不再显示「设置账号密码」表单', !acc2Html.includes('保存并启用'))

    const homeHtml = await (await get('/', acctCookie)).text()
    check('顶栏出现「已设置账号」标记', homeHtml.includes('user-dot'))
    check('顶栏 title 显示账号名', homeHtml.includes(`账号：${accountName}`))

    const db = await (await import('../src/db-sqlite.js')).createSqliteAdapter(
      process.env.DB_PATH || './data/xiumuxuan.db',
    )
    const row = await db.first('SELECT password_hash, password_salt, password_iterations FROM users WHERE username = ?', [accountName])
    db.close()
    check('数据库里没有明文密码', !String(row?.password_hash || '').includes(accountPass))
    check('密码为 64 位十六进制 PBKDF2 派生值', /^[a-f0-9]{64}$/.test(String(row?.password_hash || '')))
    check('每个用户有独立随机盐', /^[a-f0-9]{32}$/.test(String(row?.password_salt || '')))
    check('迭代次数随用户记录保存', Number(row?.password_iterations) >= 1000, String(row?.password_iterations))
  }

  // ---------------------------------------------------------- 12. 用户名唯一
  console.log('\n[12] 用户名唯一性')
  {
    const other = await post('/login', { nickname: `抢名${stamp}`, next: '/' })
    const otherCookie = sessionCookieOf(other)
    const taken = await post('/account', {
      mode: 'create', username: accountName.toUpperCase(), password: accountPass, confirm: accountPass,
    }, otherCookie ? otherCookie.pair : null)
    check('用户名大小写不敏感，重复注册被拒（409）', taken.status === 409, `实际 ${taken.status}`)
    check('提示说明用户名已被占用', (await taken.text()).includes('已经被占用'))
  }

  // ---------------------------------------------------------- 13. 用密码找回身份
  console.log('\n[13] 用密码登录并找回身份')
  {
    const wrong = await post('/login/password', { username: accountName, password: 'WrongPass123' })
    check('密码错误时登录失败（401）', wrong.status === 401, `实际 ${wrong.status}`)
    check('失败提示不区分用户名是否存在',
      (await wrong.text()).includes('用户名或密码不正确'))

    const ghost = await post('/login/password', { username: `nobody${stamp}`, password: 'WrongPass123' })
    check('不存在的用户名同样返回 401', ghost.status === 401, `实际 ${ghost.status}`)

    const ok = await post('/login/password', {
      username: accountName, password: accountPass, next: '/me',
    })
    check('正确密码登录成功（303）', ok.status === 303, `实际 ${ok.status}`)
    const sc = sessionCookieOf(ok)
    check('登录后下发新的会话 cookie', sc != null)
    check('新 cookie 与旧的不同（登录即轮换 token）',
      sc != null && sc.pair !== acctCookie, '令牌没有轮换')
    const newCookie = sc ? sc.pair : null

    const meHtml = await (await get('/me', newCookie)).text()
    check('用新身份打开 /me 成功', meHtml.includes('我的贡献'))
    check('恢复身份后看到了登出前发布的内容', meHtml.includes(recoveredMarker))
    check('恢复身份后能看到评论的删除入口', /\/comments\/\d+\/delete/.test(meHtml))

    // 关键：恢复身份后确实能删掉自己写的东西
    const delProd = await post(`/products/${productId}/delete`, {}, newCookie)
    check('恢复身份后删除了自己提交的产品关联（303）',
      delProd.status === 303 && locationOf(delProd).includes('ok=product_deleted'), locationOf(delProd))
    const companyHtml = await (await get(`/company/${companyId}`, newCookie)).text()
    check('产品关联已从厂家页消失', !companyHtml.includes(productName))

    const commentId2 = (/\/comments\/(\d+)\/delete/.exec(meHtml) || [])[1]
    const delComment = await post(`/comments/${commentId2}/delete`, {}, newCookie)
    check('恢复身份后删除了自己发布的评论（303）',
      delComment.status === 303 && locationOf(delComment).includes('ok=comment_deleted'),
      locationOf(delComment))
    const stillThere = await (await get(`/company/${companyId}`)).text()
    check('评论已从厂家页消失', !stillThere.includes(recoveredMarker))

    // 轮换后旧 cookie 必须失效
    const oldMe = await get('/me', acctCookie)
    check('登录轮换后旧 cookie 失效',
      oldMe.status === 303 && locationOf(oldMe).startsWith('/login'),
      `${oldMe.status} ${locationOf(oldMe)}`)

    // 修改密码
    const badCurrent = await post('/account', {
      current_password: 'WrongOne123', password: 'NewPass12345', confirm: 'NewPass12345',
    }, newCookie)
    check('修改密码时当前密码错误被拒（400）', badCurrent.status === 400, `实际 ${badCurrent.status}`)

    const changed = await post('/account', {
      current_password: accountPass, password: 'NewPass12345', confirm: 'NewPass12345',
    }, newCookie)
    check('修改密码成功（303）', changed.status === 303, `实际 ${changed.status}`)

    const oldPass = await post('/login/password', { username: accountName, password: accountPass })
    check('旧密码不能再用（401）', oldPass.status === 401, `实际 ${oldPass.status}`)

    const newPass = await post('/login/password', { username: accountName, password: 'NewPass12345' })
    check('新密码可以登录（303）', newPass.status === 303, `实际 ${newPass.status}`)

    // 用密码登录后，登出不再是「永久失去身份」
    const lastCookie = sessionCookieOf(newPass)
    const out = await post('/logout', {}, lastCookie ? lastCookie.pair : null)
    check('账号身份可以正常登出（303）', out.status === 303, `实际 ${out.status}`)
    const back = await post('/login/password', { username: accountName, password: 'NewPass12345' })
    check('登出后还能用密码登录回来（这正是设置密码的意义）',
      back.status === 303, `实际 ${back.status}`)
  }

  // ---------------------------------------------------------- 14. 一步注册
  console.log('\n[14] 直接在登录页注册')
  {
    const regName = `reg${stamp}`
    const regPass = 'RegPass12345'
    const regNick = `注册用户${stamp}`

    const pageHtml = await (await get('/login')).text()
    check('登录页有「注册新账号」入口', pageHtml.includes('注册新账号'))
    check('注册表单提交到 /register', pageHtml.includes('action="/register"'))
    check('注册表单含用户名/昵称/密码/确认',
      pageHtml.includes('name="username"') && pageHtml.includes('name="nickname"')
      && pageHtml.includes('name="password"') && pageHtml.includes('name="confirm"'))

    const weak = await post('/register', {
      username: regName, nickname: regNick, password: '123', confirm: '123',
    })
    check('注册时弱密码被拒（400）', weak.status === 400, `实际 ${weak.status}`)

    const mismatch = await post('/register', {
      username: regName, nickname: regNick, password: regPass, confirm: `${regPass}x`,
    })
    check('注册时两次密码不一致被拒（400）', mismatch.status === 400, `实际 ${mismatch.status}`)

    const dup = await post('/register', {
      username: accountName, nickname: regNick, password: regPass, confirm: regPass,
    })
    check('注册时用户名重复被拒（409）', dup.status === 409, `实际 ${dup.status}`)

    const created = await post('/register', {
      username: regName, nickname: regNick, password: regPass, confirm: regPass, next: '/me',
    })
    check('注册成功（303）', created.status === 303, `实际 ${created.status}`)
    const rc = sessionCookieOf(created)
    check('注册后直接拿到会话 cookie', rc != null)

    const meHtml = await (await get('/me', rc ? rc.pair : null)).text()
    check('注册后即为登录状态', meHtml.includes(regNick))
    check('注册后账号立刻生效（无需再补设）',
      meHtml.includes(regName) && meHtml.includes('换设备后可以用它和密码重新登录'))

    const relogin = await post('/login/password', { username: regName, password: regPass })
    check('注册完立刻能用账号密码登录（303）', relogin.status === 303, `实际 ${relogin.status}`)

    // 昵称留空时用用户名作署名
    const regName2 = `reg2${stamp}`
    const created2 = await post('/register', {
      username: regName2, nickname: '', password: regPass, confirm: regPass,
    })
    check('昵称留空也能注册（303）', created2.status === 303, `实际 ${created2.status}`)
    const rc2 = sessionCookieOf(created2)
    const me2 = await (await get('/me', rc2 ? rc2.pair : null)).text()
    check('昵称留空时以用户名作为署名', me2.includes(regName2))

    // 昵称里的引号与尖括号必须被转义（真实用户的昵称就可能带单引号）
    const trickyNick = `x'<b>${stamp}`
    const tricky = await post('/register', {
      username: `tr${stamp}`, nickname: trickyNick, password: regPass, confirm: regPass,
    })
    check('含特殊字符的昵称可以注册（303）', tricky.status === 303, `实际 ${tricky.status}`)
    const tc = sessionCookieOf(tricky)
    const tHtml = await (await get('/me', tc ? tc.pair : null)).text()
    check('昵称里的尖括号被转义，没有真的生成标签',
      !tHtml.includes('<b>'), '页面里出现了未转义的 <b>')
    check('昵称里的单引号被转义',
      tHtml.includes('&#39;') || tHtml.includes('&lt;'), '未找到转义后的实体')
    check('转义后页面结构完好', tHtml.includes('我的贡献') && tHtml.includes('class="user-chip"'))
  }

  // ---------------------------------------------------------- 15. 删除自己建立的厂家
  console.log('\n[15] 删除自己建立的厂家')
  {
    const ownerPass = 'OwnerPass12345'
    const ownerName = `own${stamp}`
    const reg = await post('/register', {
      username: ownerName, nickname: `厂主${stamp}`, password: ownerPass, confirm: ownerPass,
    })
    const ownerCookie = (sessionCookieOf(reg) || {}).pair
    check('准备厂主身份', ownerCookie != null)

    const compName = `待删厂家${stamp}有限公司`
    const created = await post('/companies', { name: compName, region: '测试地' }, ownerCookie)
    const cid = Number((/\/company\/(\d+)/.exec(locationOf(created)) || [])[1]) || null
    check('厂主新建厂家成功', cid != null, locationOf(created))

    // 往这个厂家挂上来自不同人的内容，用来验证连带删除
    await post('/reports', {
      company_id: cid, verdict: 'two_day',
      detail: '这是挂在待删厂家下的一条情报，用于验证连带删除是否彻底。',
    }, ownerCookie)

    const otherReg = await post('/register', {
      username: `oth${stamp}`, nickname: `路人${stamp}`, password: ownerPass, confirm: ownerPass,
    })
    const otherCookie = (sessionCookieOf(otherReg) || {}).pair
    await post('/comments', {
      company_id: cid, content: '这是另一个人留下的评论，用于验证连带删除。',
    }, otherCookie)

    const pageHtml = await (await get(`/company/${cid}`, ownerCookie)).text()
    check('厂家页出现「我建立的厂家」面板', pageHtml.includes('我建立的厂家'))
    check('面板说明会连带删除', pageHtml.includes('连带删除'))
    check('面板列出具体影响条数',
      pageHtml.includes('1 条情报') && pageHtml.includes('1 条评论'))
    check('面板警告可能牵连他人贡献', pageHtml.includes('其他人贡献的内容'))

    const strangerHtml = await (await get(`/company/${cid}`, otherCookie)).text()
    check('非建立者看不到删除面板', !strangerHtml.includes('我建立的厂家'))

    const meHtml = await (await get('/me', ownerCookie)).text()
    check('「我的贡献」列出我建立的厂家', meHtml.includes(compName))
    check('「我的贡献」显示连带影响统计', meHtml.includes('1 条情报'))

    // 越权保护
    const anon = await post(`/companies/${cid}/delete`, {})
    check('未登录不能删除厂家（303 去登录）',
      anon.status === 303 && locationOf(anon).startsWith('/login'), locationOf(anon))

    const stranger = await post(`/companies/${cid}/delete`, {}, otherCookie)
    check('非建立者不能删除厂家（forbidden）',
      stranger.status === 303 && locationOf(stranger).includes('err=forbidden'), locationOf(stranger))
    check('越权尝试后厂家依然存在', (await get(`/company/${cid}`)).status === 200)

    // 建立者删除
    const del = await post(`/companies/${cid}/delete`, {}, ownerCookie)
    check('建立者删除厂家成功（303）',
      del.status === 303 && locationOf(del).includes('ok=company_deleted'), locationOf(del))
    check('厂家页已变为 404', (await get(`/company/${cid}`)).status === 404)

    const searchHtml = await (await get(`/search?q=${encodeURIComponent(compName)}`)).text()
    // 搜索页会把查询词回显在标题与引导链接里，所以不能直接找厂名，
    // 要确认的是「结果列表里不再有指向该厂家的链接」
    check('搜索结果不再包含该厂家条目', !searchHtml.includes(`/company/${cid}"`), '结果里仍有该厂家链接')

    // 连带内容是否真的清干净，直接查库最可靠
    const db3 = await (await import('../src/db-sqlite.js')).createSqliteAdapter(
      process.env.DB_PATH || './data/xiumuxuan.db',
    )
    const leftReports = await db3.first('SELECT COUNT(*) AS n FROM reports  WHERE company_id = ?', [cid])
    const leftComments = await db3.first('SELECT COUNT(*) AS n FROM comments WHERE company_id = ?', [cid])
    const leftProducts = await db3.first('SELECT COUNT(*) AS n FROM products WHERE company_id = ?', [cid])
    db3.close()
    check('连带删除了该厂家的情报', Number(leftReports?.n ?? -1) === 0, String(leftReports?.n))
    check('连带删除了该厂家的评论', Number(leftComments?.n ?? -1) === 0, String(leftComments?.n))
    check('连带删除了该厂家的产品关联', Number(leftProducts?.n ?? -1) === 0, String(leftProducts?.n))
  }

  console.log(`\n${'─'.repeat(52)}`)
  console.log(`  通过 ${passed} 项，失败 ${failed} 项`)
  if (failed) {
    console.log('\n  失败明细：')
    for (const f of failures) console.log(`   · ${f}`)
  }
  console.log(`${'─'.repeat(52)}\n`)
  process.exit(failed ? 1 : 0)
}

main().catch((err) => {
  console.error('\n测试执行出错：', err)
  console.error('请确认服务器已启动：npm start')
  process.exit(1)
})
