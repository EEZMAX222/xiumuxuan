/**
 * 极简路径路由（零依赖，Web 标准 Request 直通）。
 *
 * 支持 /company/:id 这类具名参数与 /company/:id/edit 的混合形式。
 */

export function createRouter() {
  const routes = []

  function add(method, path, handler) {
    const parts = path.split('/').filter(Boolean)
    routes.push({ method, path, parts, handler })
    return api
  }

  const api = {
    get: (path, handler) => add('GET', path, handler),
    post: (path, handler) => add('POST', path, handler),

    /**
     * 匹配路由。
     *
     * 静态段优先于参数段：/company/new 不会被 /company/:id 抢走，
     * 因此注册顺序不会造成这类陷阱（参数段更少的路由胜出）。
     *
     * @returns {null | { handler?, params?, methodNotAllowed?: boolean, allow?: string[] }}
     */
    match(method, pathname) {
      const segs = pathname.split('/').filter(Boolean)
      let pathMatched = false
      const allow = []
      let best = null

      for (const r of routes) {
        if (r.parts.length !== segs.length) continue
        const params = {}
        let ok = true
        for (let i = 0; i < segs.length; i += 1) {
          const p = r.parts[i]
          if (p.startsWith(':')) {
            let v = segs[i]
            try { v = decodeURIComponent(v) } catch { /* 保留原值 */ }
            params[p.slice(1)] = v
          } else if (p !== segs[i]) {
            ok = false
            break
          }
        }
        if (!ok) continue
        pathMatched = true
        if (r.method !== method) {
          if (!allow.includes(r.method)) allow.push(r.method)
          continue
        }
        const paramCount = r.parts.reduce((n, p) => n + (p.startsWith(':') ? 1 : 0), 0)
        if (!best || paramCount < best.paramCount) {
          best = { handler: r.handler, params, paramCount }
        }
      }

      if (best) return { handler: best.handler, params: best.params }
      if (pathMatched) return { methodNotAllowed: true, allow }
      return null
    },

    list() {
      return routes.map((r) => `${r.method} ${r.path}`)
    },
  }

  return api
}
