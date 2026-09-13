/**
 * 端到端冒烟测试：覆盖搜索、厂家、产品关联、双休情报上传、评论、
 * 地区拦截、XSS 转义、蜜罐与限流。
 *
 * 用法：
 *   1) 先启动服务器：npm start
 *   2) 另开终端运行：npm test
 *   （可用 BASE=http://127.0.0.1:8787 指定地址）
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

async function postForm(path, fields) {
  const body = new URLSearchParams()
  for (const [k, v] of Object.entries(fields)) body.set(k, String(v))
  return fetch(`${BASE}${path}`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  })
}

function locationOf(res) {
  return res.headers.get('location') || ''
}

function idFromLocation(loc) {
  const m = /\/company\/(\d+)/.exec(loc)
  return m ? Number(m[1]) : null
}

async function main() {
  console.log(`\n休沐选 · 端到端测试  目标：${BASE}\n`)
  const stamp = Date.now().toString().slice(-6)

  // ---------------------------------------------------------- 1. 基础可用性
  console.log('[1] 基础可用性')
  {
    const res = await get('/healthz')
    const json = await res.json().catch(() => null)
    check('GET /healthz 返回 200', res.status === 200, `实际 ${res.status}`)
    check('healthz 返回 ok:true', json && json.ok === true)

    const home = await get('/')
    const body = await home.text()
    check('GET / 返回 200', home.status === 200, `实际 ${home.status}`)
    check('首页包含站点名「休沐选」', body.includes('休沐选'))
    check('首页包含搜索框', body.includes('name="q"'))

    const css = await get('/style.css')
    check('GET /style.css 返回 200', css.status === 200)

    const missing = await get('/this-page-does-not-exist')
    check('未知路径返回 404', missing.status === 404, `实际 ${missing.status}`)
  }

  // ---------------------------------------------------------- 2. 来源地区拦截
  console.log('\n[2] 来源地区拦截（用 ?__geo= 模拟）')
  {
    const cn = await get('/?__geo=CN')
    const cnBody = await cn.text()
    check('CN 访问首页被拒（403）', cn.status === 403, `实际 ${cn.status}`)
    check('拦截响应极简，不出现站点名', !cnBody.includes('休沐选'), cnBody.slice(0, 80))
    check('拦截响应不提及站点的用途/立场',
      !cnBody.includes('双休') && !cnBody.includes('中国大陆'))
    check('拦截响应不回显地区码', !cnBody.includes('CN'), cnBody.slice(0, 80))
    check('拦截响应带 noindex', (cn.headers.get('x-robots-tag') || '').includes('noindex'))
    check('拦截响应不缓存', (cn.headers.get('cache-control') || '').includes('no-store'))

    const cnPost = await postForm('/comments?__geo=CN', { company_id: 1, content: '测试' })
    check('CN 的 POST 提交同样被拒（403）', cnPost.status === 403, `实际 ${cnPost.status}`)

    const hk = await get('/?__geo=HK')
    check('HK 可正常访问（不误伤港澳台）', hk.status === 200, `实际 ${hk.status}`)

    const us = await get('/?__geo=US')
    check('US 可正常访问', us.status === 200, `实际 ${us.status}`)
  }

  // ---------------------------------------------------------- 3. 新建厂家
  console.log('\n[3] 用户上传：新建厂家')
  let companyId = null
  const companyName = `长丰精密制造${stamp}有限公司`
  const companyNameNoSuffix = `长丰精密制造${stamp}`
  {
    const res = await postForm('/companies', {
      name: companyName,
      aliases: '长丰精密|Changfeng',
      industry: '消费电子代工',
      region: '广东 深圳',
      website: 'https://example.com',
      note: '为多个品牌代工小家电。',
    })
    check('POST /companies 重定向到厂家页（303）', res.status === 303, `实际 ${res.status}`)
    companyId = idFromLocation(locationOf(res))
    check('重定向 URL 含厂家 id', companyId != null, locationOf(res))

    const page = await get(`/company/${companyId}`)
    const html = await page.text()
    check('厂家页返回 200', page.status === 200)
    check('厂家页显示厂家名称', html.includes('长丰精密制造'))
    check('厂家页显示行业标签', html.includes('消费电子代工'))
    check('厂家页在无情报时提示样本不足', html.includes('样本不足'))

    // 同名（去掉「有限公司」后缀）应被识别为同一家，而不是新建重复条目
    const dup = await postForm('/companies', { name: companyNameNoSuffix })
    check('归一化后同名厂家被复用（303 到同一 id）',
      dup.status === 303 && idFromLocation(locationOf(dup)) === companyId,
      locationOf(dup))
  }

  // ---------------------------------------------------------- 4. 上传双休情报
  console.log('\n[4] 用户上传：双休情报')
  {
    const bad = await postForm('/reports', {
      company_id: companyId,
      verdict: '',
      detail: '太短',
    })
    check('缺少「休息情况」时被校验拒绝（400）', bad.status === 400, `实际 ${bad.status}`)

    const shortDetail = await postForm('/reports', {
      company_id: companyId, verdict: 'two_day', detail: '还不错',
    })
    check('补充说明过短时被拒绝（400）',
      shortDetail.status === 400, `实际 ${shortDetail.status}`)

    const good = await postForm('/reports', {
      company_id: companyId,
      verdict: 'two_day',
      schedule: '9:00-18:00，周一至周五',
      rest_days: '2',
      weekly_hours: '40',
      overtime: '平时不加班，旺季偶尔到 20:00',
      make_up_work: '1',
      position: '质检',
      employment: 'former',
      detail: '2024 年在这里做质检，全年都是双休，只有旺季有几天延时。',
    })
    check('合法情报提交成功（303）', good.status === 303, `实际 ${good.status}`)
    check('重定向回厂家页并带成功提示',
      locationOf(good).includes('/company/') && locationOf(good).includes('ok=report_created'),
      locationOf(good))

    // 再来两条不同来源的情报，凑够 3 条有效样本
    await postForm('/reports', {
      company_id: companyId, verdict: 'two_day_ish', schedule: '大小周以外的双休',
      rest_days: '2', weekly_hours: '42', employment: 'current',
      detail: '我同学在这里，名义双休，但月底周六偶尔要去半天。',
    })
    await postForm('/reports', {
      company_id: companyId, verdict: 'two_day', schedule: '朝九晚六',
      rest_days: '2', weekly_hours: '40', employment: 'former',
      detail: '我 2023 年到 2025 年在这里上班，双休一直执行得比较到位。',
    })

    const page = await get(`/company/${companyId}`)
    const html = await page.text()
    check('厂家页出现 A/B 等级与指数分数', /class="grade">[AB]</.test(html), '未找到等级徽章')
    check('厂家页显示「双休」标签', html.includes('双休'))
    check('厂家页显示提交的作息描述', html.includes('9:00-18:00'))
    check('厂家页显示情报数量统计', /共 \d+ 条/.test(html))
  }

  // ---------------------------------------------------------- 5. 产品关联与搜索
  console.log('\n[5] 产品关联与搜索')
  const productName = `长丰牌 4L 电饭煲 ${stamp}`
  {
    const res = await postForm('/products', {
      name: productName,
      brand: '长丰',
      category: '小家电',
      company_id: companyId,
    })
    check('POST /products 提交成功（303）', res.status === 303, `实际 ${res.status}`)

    const search = await get(`/search?q=${encodeURIComponent('长丰牌 4L 电饭煲 ' + stamp)}`)
    const body = await search.text()
    check('搜索页返回 200', search.status === 200)
    check('搜索能命中刚提交的产品', body.includes(`4L 电饭煲`))
    check('搜索结果带出生产厂家', body.includes('长丰精密制造'))
    check('搜索结果展示双休等级', /class="grade">[AB]</.test(body))

    // 用产品名的一部分（去掉「牌」和空格）也应命中 —— 验证归一化
    const fuzzy = await get(`/search?q=${encodeURIComponent('长丰牌4L电饭煲' + stamp)}`)
    const fuzzyBody = await fuzzy.text()
    check('归一化后模糊搜索仍能命中', fuzzyBody.includes('4L 电饭煲'))

    const searchCompany = await get(`/search?q=${encodeURIComponent(companyName)}`)
    const scBody = await searchCompany.text()
    check('直接搜厂家名能找到厂家', scBody.includes('长丰精密制造'))

    const empty = await get('/search?q=' + encodeURIComponent('完全不存在的产品' + stamp))
    const emptyBody = await empty.text()
    check('无结果时给出「提交关联」的引导', emptyBody.includes('没有找到相关记录'))
    check('无结果页提供产品提交入口', emptyBody.includes('/product/new'))
  }

  // ---------------------------------------------------------- 6. 评论
  console.log('\n[6] 评论')
  {
    const marker = `评论标记-${stamp}`
    const res = await postForm('/comments', {
      company_id: companyId,
      nickname: '前质检员',
      content: `${marker} 我在这家做过两年，确实双休，但年终奖一般。`,
    })
    check('POST /comments 提交成功（303）', res.status === 303, `实际 ${res.status}`)
    check('重定向锚点到评论区', locationOf(res).includes('#comments'), locationOf(res))

    const page = await get(`/company/${companyId}`)
    const html = await page.text()
    check('厂家页显示评论内容', html.includes(marker))
    check('厂家页显示评论昵称', html.includes('前质检员'))

    const tooShort = await postForm('/comments', { company_id: companyId, content: 'x' })
    check('过短评论被拒绝', tooShort.status === 303 && locationOf(tooShort).includes('err=bad_request'),
      locationOf(tooShort))
  }

  // ---------------------------------------------------------- 7. 安全
  console.log('\n[7] 安全与防滥用')
  {
    const marker = `<script>alert('xss-${stamp}')</script>`
    await postForm('/comments', { company_id: companyId, content: `${marker} 这是我在测试转义。` })
    const page = await get(`/company/${companyId}`)
    const html = await page.text()
    check('评论中的脚本标签被 HTML 转义',
      html.includes('&lt;script&gt;') && !html.includes(marker),
      html.includes(marker) ? '页面出现未转义的原始 <script>' : '页面未找到转义后的内容，评论可能未落库')

    const before = await (await get(`/company/${companyId}`)).text()
    const beforeCount = (before.match(/class="comment"/g) || []).length
    await postForm('/comments', {
      company_id: companyId, content: '蜜罐测试内容', website_hp: 'http://spam.example',
    })
    const after = await (await get(`/company/${companyId}`)).text()
    const afterCount = (after.match(/class="comment"/g) || []).length
    check('蜜罐字段被填写时内容不落库', beforeCount === afterCount,
      `评论数 ${beforeCount} -> ${afterCount}`)

    const noCompany = await postForm('/comments', { company_id: 999999, content: '不存在的厂家' })
    check('对不存在的厂家评论被拒', noCompany.status === 303 && locationOf(noCompany).includes('err=not_found'),
      locationOf(noCompany))

    const wrongMethod = await fetch(`${BASE}/`, { method: 'DELETE', redirect: 'manual' })
    check('不支持的方法返回 405', wrongMethod.status === 405, `实际 ${wrongMethod.status}`)

    // 频率限制：RATE_LIMITS.report 默认 5 条/小时。
    // 前面各段已经消耗了一部分额度，所以这里只断言「最终一定会被拦住」。
    let hitLimit = false
    let attempts = 0
    for (; attempts < 12 && !hitLimit; attempts += 1) {
      const res = await postForm('/reports', {
        company_id: companyId,
        verdict: 'two_day',
        detail: `频率限制测试第 ${attempts + 1} 条，每条内容都不同以避免被去重逻辑拦下。`,
      })
      if (res.status === 429) hitLimit = true
    }
    check('超过每小时上限后提交被限流（429）', hitLimit,
      `连续提交 ${attempts} 次仍未触发限流`)
  }

  // ---------------------------------------------------------- 8. 首页榜单
  console.log('\n[8] 首页榜单与统计')
  {
    const home = await get('/')
    const body = await home.text()
    check('首页出现最新情报流', body.includes('最新上传的情报'))
    check('首页统计区渲染成功', body.includes('收录厂家'))

    const about = await get('/about')
    const aboutBody = await about.text()
    check('关于页说明数据全部来自用户上传', aboutBody.includes('全部来自像你一样的用户上传'))
    check('关于页说明指数算法', aboutBody.includes('半衰期'))
    check('关于页已不出现地区拦截说明', !aboutBody.includes('中国大陆') && !aboutBody.includes('屏蔽'))
  }

  // ---------------------------------------------------------- 汇总
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
