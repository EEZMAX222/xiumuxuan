/**
 * 极简 HTML 模板（替代 hono/html，保持零依赖）。
 *
 * 用法：
 *   html`<p>${userInput}</p>`            —— 插值自动 HTML 转义
 *   html`<div>${raw(safeHtmlString)}</div>` —— 显式声明「已安全」，原样输出
 *   html`<ul>${items.map(i => html`<li>${i}</li>`)}</ul>` —— 数组自动展开
 *
 * 安全约定：任何进入 html`` 的值都会被转义，除非用 raw() 显式包裹。
 */

const ESCAPE_MAP = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ESCAPE_MAP[ch])
}

class RawHtml {
  constructor(value) {
    this.value = value
  }
  toString() {
    return this.value
  }
}

/** 标记一段字符串为「已安全的 HTML」，模板中不再转义 */
export function raw(value) {
  return new RawHtml(value instanceof RawHtml ? value.value : String(value ?? ''))
}

function render(value) {
  if (value === null || value === undefined || value === false || value === true) return ''
  if (value instanceof RawHtml) return value.value
  if (Array.isArray(value)) return value.map(render).join('')
  if (typeof value === 'object' && typeof value.toString === 'function' && value.toString !== Object.prototype.toString) {
    return esc(value.toString())
  }
  if (typeof value === 'object') return ''
  return esc(value)
}

export function html(strings, ...values) {
  let out = strings[0]
  for (let i = 0; i < values.length; i += 1) {
    out += render(values[i]) + strings[i + 1]
  }
  return new RawHtml(out)
}

/** 把 html`` 的结果或任意值转成最终字符串 */
export function toHtmlString(value) {
  return value instanceof RawHtml ? value.value : esc(value)
}

/** 生成 HTML Response */
export function htmlResponse(value, status = 200, headers = {}) {
  return new Response(toHtmlString(value), {
    status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      ...headers,
    },
  })
}
