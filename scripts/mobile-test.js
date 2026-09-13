/**
 * 移动端适配自检。
 *
 * 检查的是「服务端渲染出来的东西是否满足移动端要求」：
 * 视口声明、断点规则、触控尺寸、防横向溢出的换行规则等。
 *
 * ⚠️ 它不能替代真机检查。视觉表现、键盘弹出、滚动手感这些，
 *    仍然要在手机上实际打开看一眼。
 *
 * 用法（由 scripts/run-tests.js 在独立测试库上调用）：
 *   BASE=http://127.0.0.1:8788 node scripts/mobile-test.js
 */

const BASE = process.env.BASE || 'http://127.0.0.1:8787'

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

async function get(path, init = {}) {
  return fetch(`${BASE}${path}`, { redirect: 'manual', ...init })
}

const PUBLIC_PAGES = [
  ['/', '首页'],
  ['/login', '登录/注册'],
  ['/about', '关于'],
  ['/search?q=test', '搜索'],
  ['/report/new', '上传情报'],
  ['/company/new', '新建厂家'],
  ['/product/new', '提交产品'],
]

async function main() {
  console.log(`\n休沐选 · 移动端适配自检  目标：${BASE}\n`)

  // ---------------------------------------------------------- 1. 样式表
  console.log('[1] 样式表')
  const css = await (await get('/style.css')).text()

  check('含手机断点 (max-width:760px)', /@media\s*\(max-width:\s*760px\)/.test(css))
  check('含窄屏断点 (max-width:400px)', /@media\s*\(max-width:\s*400px\)/.test(css))

  const i760 = css.indexOf('@media (max-width:760px)')
  const block = i760 >= 0 ? css.slice(i760) : ''

  // iOS 在输入框字号小于 16px 时会自动放大整个页面，这是硬要求
  check('手机断点内输入控件字号提到 16px（防 iOS 聚焦缩放）',
    /font-size:16px/.test(block))
  check('手机断点内主按钮整行显示', /width:100%/.test(block))
  check('手机断点内触控目标有最小高度', /min-height:44px/.test(block))
  check('手机断点内导航独占一行', /flex:0 0 100%/.test(block))
  check('导航链接声明不可压缩（防被挤成逐字竖排）', /flex:0 0 auto/.test(block))
  check('导航链接禁止折行', /white-space:nowrap/.test(block))
  check('手机断点内栅格改为单列', /grid-template-columns:1fr/.test(block))
  check('手机断点内收窄了页面留白', /main\.container\{padding/.test(block))

  check('有长内容换行规则（防横向溢出）', css.includes('overflow-wrap:anywhere'))
  check('适配刘海屏安全区', css.includes('safe-area-inset'))
  check('密码输入框已套用表单样式', css.includes('input[type=password]'))

  // 不该出现的：写死的宽表格 / 固定大宽度
  check('没有使用 table 布局', !css.includes('table{'))

  // ---------------------------------------------------------- 2. 公开页面
  console.log('\n[2] 公开页面的视口声明')
  for (const [path, label] of PUBLIC_PAGES) {
    const res = await get(path)
    const html = await res.text()
    const okStatus = res.status === 200
    check(`${label} 可访问`, okStatus, `实际 ${res.status}`)
    if (!okStatus) continue
    check(`${label} 声明 width=device-width`,
      /<meta name="viewport" content="width=device-width/.test(html))
    check(`${label} 声明 viewport-fit=cover`, html.includes('viewport-fit=cover'))
    check(`${label} 没有写死的超宽内联宽度`,
      !/style="[^"]*width:\s*\d{4,}px/.test(html))
  }

  // ---------------------------------------------------------- 3. 登录后的页面
  console.log('\n[3] 登录后的页面')
  {
    const stamp = Date.now().toString().slice(-6)
    const reg = await fetch(`${BASE}/register`, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        username: `m${stamp}`,
        nickname: `移动端检查${stamp}`,
        password: 'MobileCheck12345',
        confirm: 'MobileCheck12345',
      }),
    })
    const cookie = (reg.headers.getSetCookie() || []).map((c) => c.split(';')[0]).join('; ')
    check('准备登录态用于检查 /me 与 /account', reg.status === 303, `实际 ${reg.status}`)

    for (const [path, label] of [['/me', '我的贡献'], ['/account', '账号设置']]) {
      const res = await fetch(`${BASE}${path}`, { headers: { cookie }, redirect: 'manual' })
      const html = await res.text()
      check(`${label} 可访问`, res.status === 200, `实际 ${res.status}`)
      check(`${label} 声明 width=device-width`, html.includes('width=device-width'))
      check(`${label} 声明 viewport-fit=cover`, html.includes('viewport-fit=cover'))
    }
  }

  // ---------------------------------------------------------- 4. 输入体验
  console.log('\n[4] 输入体验')
  {
    const homeHtml = await (await get('/')).text()
    check('样式表引用带版本号（避免改动后仍用旧缓存）',
      /\/style\.css\?v=[a-z0-9]+/.test(homeHtml), '未找到 ?v= 版本参数')
    check('搜索框声明了搜索键（手机键盘显示「搜索」）',
      homeHtml.includes('enterkeyhint="search"'))
    check('搜索框用 type=search', homeHtml.includes('type="search"'))

    const reportHtml = await (await get('/report/new')).text()
    check('数字输入声明了小数键盘',
      (reportHtml.match(/inputmode="decimal"/g) || []).length >= 2,
      `找到 ${(reportHtml.match(/inputmode="decimal"/g) || []).length} 处`)
    check('表单没有写死宽度（应随容器自适应）',
      !/style="width:\s*\d+px/.test(reportHtml))

    const loginHtml = await (await get('/login')).text()
    check('登录页三个表单都有视口友好的结构',
      loginHtml.includes('login-grid') && loginHtml.includes('login-block'))
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
  console.error('\n自检执行出错：', err)
  console.error('请确认测试服务器已启动')
  process.exit(1)
})
