/**
 * 地域访问控制：禁止中国大陆（CN）IP 访问本站。
 *
 * 三层防护，逐层收紧：
 *   1) Cloudflare WAF 自定义规则（网络边缘）—— 最彻底，且不消耗 Workers 配额
 *      见 docs/DEPLOY-CLOUDFLARE.md
 *   2) 本模块：读取 Cloudflare 注入的国家码（request.cf.country / CF-IPCountry）
 *   3) 未经过 Cloudflare 时按 GEO_POLICY 决定 fail-open 还是 fail-closed
 *
 * Cloudflare 对香港返回 HK、澳门 MO、台湾 TW，因此封锁 "CN" 精确对应
 * 「中国大陆」，不会误伤港澳台。
 *
 * 本模块只使用 Web 标准 API，Node 与 Cloudflare Workers 通用。
 */

export const DEFAULT_BLOCKED_COUNTRIES = ['CN']

/**
 * 解析请求来源国家码（两位大写）。解析不到返回 null。
 * @param {Request} request
 * @param {Record<string, any>} env
 */
export function resolveCountry(request, env = {}) {
  // 1) Cloudflare Workers / Pages：request.cf 由边缘注入
  const cf = request.cf
  if (cf && typeof cf.country === 'string' && cf.country) {
    return cf.country.toUpperCase()
  }

  // 2) 站点挂在 Cloudflare 代理之后（橙色云朵）时由 CF 注入的请求头
  const cfCountry = request.headers.get('cf-ipcountry')
  if (cfCountry && cfCountry.toUpperCase() !== 'XX') {
    return cfCountry.toUpperCase()
  }

  // 3) 自建反向代理可注入（仅在代理层可信时启用）
  const custom = request.headers.get('x-country-code')
  if (custom) return custom.toUpperCase()

  // 4) 本地开发模拟：仅当 GEO_DEBUG=1 时生效
  if (String(env.GEO_DEBUG) === '1') {
    try {
      const q = new URL(request.url).searchParams.get('__geo')
      if (q) return q.toUpperCase()
    } catch { /* ignore */ }
    const h = request.headers.get('x-debug-country')
    if (h) return h.toUpperCase()
  }

  return null
}

/** 取真实客户端 IP（仅用于哈希与限流，不会明文入库） */
export function resolveClientIp(request) {
  const h = request.headers
  const direct = h.get('cf-connecting-ip') || h.get('x-real-ip')
  if (direct) return direct.trim()
  const xff = h.get('x-forwarded-for')
  if (xff) return xff.split(',')[0].trim()
  return h.get('x-forwarded') || '0.0.0.0'
}

/** 是否为本地 / 内网地址（本地开发与健康检查始终放行） */
export function isPrivateOrLocalIp(ip) {
  if (!ip) return true
  const v = String(ip).replace(/^::ffff:/, '')
  if (v === '0.0.0.0' || v === '::1' || v === '127.0.0.1') return true
  if (v.startsWith('10.') || v.startsWith('192.168.')) return true
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(v)) return true
  if (v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80')) return true
  return false
}

/**
 * 判断本次请求是否应当被地域封锁。
 * @returns {{ allowed: boolean, country: string|null, ip: string, reason?: string }}
 */
export function checkGeo(request, env = {}) {
  const blocked = String(env.BLOCKED_COUNTRIES || DEFAULT_BLOCKED_COUNTRIES.join(','))
    .split(',').map((s) => s.trim().toUpperCase()).filter(Boolean)
  const policy = String(env.GEO_POLICY || 'fail-open')
  const ip = resolveClientIp(request)
  const country = resolveCountry(request, env)

  const hasDebug = String(env.GEO_DEBUG) === '1' &&
    (request.headers.get('x-debug-country') || /[?&]__geo=/.test(request.url))

  // 本地开发、内网调用、健康检查：放行
  if (isPrivateOrLocalIp(ip) && !hasDebug) {
    return { allowed: true, country: country || 'LOCAL', ip }
  }

  if (country && blocked.includes(country)) {
    return { allowed: false, country, ip, reason: 'blocked-region' }
  }

  if (!country && policy === 'fail-closed') {
    return { allowed: false, country: null, ip, reason: 'unknown-region' }
  }

  return { allowed: true, country: country || 'UNKNOWN', ip }
}

/**
 * 被封锁时的响应。
 *
 * 刻意做成一个「什么都不说」的 403：
 *   - 不渲染站点名称、用途、立场
 *   - 不回显检测到的地区码
 *   - 不给任何解释或建议
 *
 * 原因很简单：封锁页上的每一句说明，对来访者都是情报。
 * 被拦下的人不需要知道这里是什么站、为什么拦——越少越好。
 * 站长自己需要诊断时，看服务端日志即可（app.js 会记录被封的国家码与路径）。
 */
export function blockedResponse() {
  return new Response('403 Forbidden', {
    status: 403,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
      'x-robots-tag': 'noindex',
    },
  })
}
