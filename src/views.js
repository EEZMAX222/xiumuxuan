/**
 * 休沐选 — 全部页面视图。
 * 仅使用自研 html`` 模板（自动转义），无第三方模板引擎。
 */
import { html, raw } from './html.js'
import { ASSET_VERSION } from './assets.js'
import {
  VERDICTS, EMPLOYMENTS, CONFIDENCE_LABEL,
  formatDateTime, formatDate, relativeTime, escapeHtml,
} from './logic.js'

export const SITE = {
  name: '休沐选',
  tagline: '搜一个产品，看它的生产厂家到底休不休双休',
  description: '休沐选是一个由用户众包上传的厂家休息制度事实库：搜索产品就能看到其生产厂家的双休履行情况。',
}

const FLASH_OK = {
  report_created: '情报已提交，感谢你为休息权添了一块砖。',
  comment_created: '评论已发布。',
  comment_updated: '评论已更新。',
  comment_deleted: '评论已删除。',
  report_deleted: '情报已删除。',
  product_deleted: '产品关联已删除。',
  company_deleted: '厂家条目已删除，它下面的情报、评论和产品关联也一并移除了。',
  account_created: '账号已设置。以后换设备也能用用户名和密码登录回来了。',
  password_changed: '密码已更新。',
  company_created: '厂家已建立。',
  company_exists: '这个厂家已经在库里了，已为你打开它的页面。',
  product_created: '产品与厂家的关联已建立，现在可以在搜索中找到它了。',
  logged_in: '已登录。现在你发布的内容都可以自己管理了。',
  logged_out: '已退出登录，该身份已失效。本站没有密码，因此它无法再次登录。',
}

const FLASH_ERR = {
  rate_limited: '操作过于频繁，请稍后再试。',
  duplicate: '你在短时间内已经提交过相同内容了。',
  not_found: '找不到对应的记录。',
  bad_request: '提交的数据不完整或不合法。',
  forbidden: '这条内容不是你发布的，无法修改。',
  login_required: '请先以游客身份登录，才能管理自己的内容。',
}

// ------------------------------------------------------------------ 基础布局

function flashFrom(query) {
  const ok = query.get('ok')
  const err = query.get('err')
  if (ok && FLASH_OK[ok]) return { type: 'ok', text: FLASH_OK[ok] }
  if (err && FLASH_ERR[err]) return { type: 'err', text: FLASH_ERR[err] }
  return null
}

function nav(current) {
  const items = [
    ['/', '首页'],
    ['/search', '搜索'],
    ['/report/new', '上传双休情报'],
    ['/about', '关于与数据来源'],
  ]
  return html`<nav class="nav">
    ${items.map(([href, label]) => html`<a href="${href}" class="${current === href ? 'active' : ''}">${label}</a>`)}
  </nav>`
}

/** 顶栏右侧：身份区 */
function userArea(user) {
  if (!user) {
    return html`<div class="user-area">
      <a class="btn btn-ghost" href="/login">登录</a>
    </div>`
  }
  const initial = (user.nickname || '游').trim().slice(0, 1) || '游'
  const hasAcct = Boolean(user.username && user.password_hash)
  // ⚠️ confirm 的文案必须是固定字面量，绝不能插值用户数据。
  // html`` 会把 ' 转义成 &#39;，但浏览器解析 HTML 属性时会把它解码回 '，
  // 于是撑破 JS 字符串造成注入。所有 onsubmit/onclick 都遵守这条。
  const logoutConfirm = hasAcct
    ? '退出后可以用用户名和密码重新登录，你发布的内容不会丢失。确定退出？'
    : '退出后这个身份将无法再登录（你还没有设置账号密码），你发布的内容会保留但无法再管理。确定退出？'
  return html`<div class="user-area">
    <a class="user-chip" href="/me"
       title="${hasAcct ? `账号：${user.username}` : '尚未设置账号密码，换设备会丢失身份'}">
      <span class="user-avatar">${initial}</span>
      <span class="user-name">${user.nickname}</span>
      ${hasAcct ? html`<span class="user-dot" aria-label="已设置账号密码"></span>` : ''}
    </a>
    <form class="inline-form" action="/logout" method="post"
          onsubmit="return confirm('${logoutConfirm}')">
      <button class="link-btn" type="submit">退出</button>
    </form>
  </div>`
}

function searchBox(q = '', compact = false) {
  return html`<form class="search-form ${compact ? 'compact' : ''}" action="/search" method="get" role="search">
    <input class="search-input" type="search" name="q" value="${q}" required
           placeholder="输入产品名称、品牌或厂家，例如「某品牌电饭煲」"
           enterkeyhint="search" aria-label="搜索产品">
    <button class="btn btn-primary" type="submit">查一查</button>
  </form>`
}

export function layout({ title, body, query = new URLSearchParams(), current = '', bodyClass = '', user = null }) {
  const flash = flashFrom(query)
  const fullTitle = title ? `${title} · ${SITE.name}` : `${SITE.name} · ${SITE.tagline}`
  return html`<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#0f766e">
<meta name="color-scheme" content="light">
<title>${fullTitle}</title>
<meta name="description" content="${SITE.description}">
<meta name="referrer" content="no-referrer">
<meta name="robots" content="index,follow">
<link rel="stylesheet" href="/style.css?v=${ASSET_VERSION}">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
</head>
<body class="${bodyClass}">
<header class="site-header">
  <div class="container header-inner">
    <a class="brand" href="/">
      <span class="brand-mark">休</span>
      <span class="brand-text">
        <strong>${SITE.name}</strong>
        <small>${SITE.tagline}</small>
      </span>
    </a>
    ${nav(current)}
    ${userArea(user)}
  </div>
</header>
<main class="container">
  ${flash ? html`<div class="notice notice-${flash.type}" role="status">${flash.text}</div>` : ''}
  ${body}
</main>
<footer class="site-footer">
  <div class="container">
    <p><strong>数据来源声明：</strong>本站所有关于「是否双休」的信息均由用户自行上传，
       未经本站核实，也不代表本站立场。请把它当作线索，而不是结论。</p>
    <p><strong>隐私：</strong>本站不保存上传者的明文 IP，仅保存加盐哈希用于防刷；
       请勿在内容中填写真实姓名、工号等可识别个人身份的信息。</p>
    <p class="footer-meta">${SITE.name} · 内容版权归各自上传者所有</p>
  </div>
</footer>
</body>
</html>`
}

// ------------------------------------------------------------------ 小组件

export function indexBadge(idx, { size = 'md' } = {}) {
  const hasGrade = idx.grade != null
  const grade = hasGrade ? idx.grade : '?'
  const score = idx.score == null ? null : idx.score
  return html`<div class="index-badge size-${size} tone-${idx.tone}" title="${idx.gradeTitle}">
    <span class="grade">${grade}</span>
    <span class="score">${score == null ? '暂无数据' : score.toFixed(1)}</span>
  </div>`
}

function toneOf(idx) {
  return idx.tone || 'muted'
}

function verdictChip(key) {
  const v = VERDICTS[key]
  if (!v) return ''
  return html`<span class="chip chip-${v.tone}">${v.label}</span>`
}

function confidenceNote(idx) {
  return html`<span class="confidence conf-${idx.confidence}">${CONFIDENCE_LABEL[idx.confidence]}</span>`
}

function emptyState(title, desc, action) {
  return html`<div class="empty">
    <p class="empty-title">${title}</p>
    <p class="empty-desc">${desc}</p>
    ${action || ''}
  </div>`
}

// ------------------------------------------------------------------ 首页

export function homePage({ stats, topGood, topBad, latest, query, user }) {
  return layout({
    title: '',
    query,
    current: '/',
    user,
    body: html`
    <section class="hero">
      <h1>这家厂子，到底双休吗？</h1>
      <p class="hero-sub">搜一个产品，看看它的生产厂家有没有把双休落到实处。
        所有情报都来自和它打过交道的普通人。</p>
      ${searchBox()}
      <p class="hero-hint">
        没有收录？<a href="/product/new">提交一条「产品 → 厂家」关联</a>，
        或直接<a href="/report/new">上传你掌握的情报</a>。
      </p>
    </section>

    <section class="stats">
      <div class="stat"><b>${stats.companies}</b><span>收录厂家</span></div>
      <div class="stat"><b>${stats.products}</b><span>收录产品</span></div>
      <div class="stat"><b>${stats.reports}</b><span>双休情报</span></div>
      <div class="stat"><b>${stats.comments}</b><span>用户评论</span></div>
    </section>

    <div class="grid grid-2">
      <section class="card">
        <h2>双休落实最好 <small>（样本 ≥ 3）</small></h2>
        ${topGood.length ? html`<ul class="rank-list">${topGood.map(rankRow)}</ul>`
          : html`<p class="muted">还没有足够的情报，欢迎你成为第一个上传者。</p>`}
      </section>
      <section class="card">
        <h2>休息权最堪忧 <small>（样本 ≥ 3）</small></h2>
        ${topBad.length ? html`<ul class="rank-list">${topBad.map(rankRow)}</ul>`
          : html`<p class="muted">还没有足够的情报，欢迎你成为第一个上传者。</p>`}
      </section>
    </div>

    <section class="card">
      <h2>最新上传的情报</h2>
      ${latest.length
        ? html`<ul class="feed">${latest.map((r) => html`<li>
            <a class="feed-company" href="/company/${r.company_id}">${r.company_name}</a>
            ${verdictChip(r.verdict)}
            <span class="feed-time">${relativeTime(r.created_at)}</span>
            ${r.schedule ? html`<div class="feed-desc">${r.schedule}</div>` : ''}
          </li>`)}</ul>`
        : emptyState('还没有任何情报', '这个站点的第一条情报，可以是你写的。', html`<a class="btn btn-primary" href="/report/new">上传双休情报</a>`)}
    </section>
  `,
  })
}

function rankRow(row) {
  return html`<li class="rank-row">
    <a href="/company/${row.company.id}" class="rank-name">${row.company.name}</a>
    <span class="rank-place">${row.company.region || ''}</span>
    ${indexBadge(row.index, { size: 'sm' })}
    <span class="rank-n">${row.index.effective} 条有效情报</span>
  </li>`
}

// ------------------------------------------------------------------ 搜索

export function searchPage({ q, productHits, companyHits, query, user }) {
  const hasQ = q && q.trim().length > 0
  const total = productHits.length + companyHits.length
  return layout({
    title: hasQ ? `搜索「${q}」` : '搜索',
    query,
    current: '/search',
    user,
    body: html`
    <section class="card search-card">
      <h1 class="page-title">${hasQ ? html`搜索「${q}」` : '搜索产品'}</h1>
      ${searchBox(q, true)}
      <p class="muted small">可以搜产品名、品牌，也可以直接搜厂家名。名称会自动忽略空格、标点与「有限公司」这类后缀。</p>
    </section>

    ${!hasQ ? '' : (total === 0
      ? html`<section class="card">${emptyState(
          '没有找到相关记录',
          '「休沐选」的数据完全来自用户上传，所以查不到很正常。你可以先把这条「产品 → 厂家」的关联建立起来。',
          html`<div class="empty-actions">
            <a class="btn btn-primary" href="/product/new?q=${encodeURIComponent(q)}">提交产品与厂家的关联</a>
            <a class="btn" href="/company/new?name=${encodeURIComponent(q)}">这个其实是厂家名，直接新建厂家</a>
          </div>`,
        )}</section>`
      : html`
        ${productHits.length ? html`<section class="card">
          <h2>产品 <small>共 ${productHits.length} 条</small></h2>
          <ul class="result-list">${productHits.map(productRow)}</ul>
        </section>` : ''}

        ${companyHits.length ? html`<section class="card">
          <h2>厂家 <small>共 ${companyHits.length} 条</small></h2>
          <ul class="result-list">${companyHits.map(companyRow)}</ul>
        </section>` : ''}

        <section class="card subtle">
          <h3>没有你要的那个？</h3>
          <p class="muted">数据靠大家上传。你可以补充一条关联，或直接上传你了解的厂家情报。</p>
          <div class="empty-actions">
            <a class="btn" href="/product/new?q=${encodeURIComponent(q)}">补充产品 → 厂家</a>
            <a class="btn" href="/report/new?q=${encodeURIComponent(q)}">直接上传情报</a>
          </div>
        </section>
      `)}
  `,
  })
}

function productRow(hit) {
  const { product, company, index } = hit
  return html`<li class="result-row">
    <div class="result-main">
      <a class="result-title" href="/company/${company.id}">${product.name}</a>
      <div class="result-meta">
        ${product.brand ? html`<span class="tag">品牌 ${product.brand}</span>` : ''}
        ${product.category ? html`<span class="tag">${product.category}</span>` : ''}
        <span class="result-company">生产厂家：<a href="/company/${company.id}">${company.name}</a></span>
      </div>
    </div>
    <div class="result-side">
      ${indexBadge(index, { size: 'sm' })}
      <span class="result-verdict">${index.grade == null ? '情报不足' : index.gradeTitle}</span>
    </div>
  </li>`
}

function companyRow(row) {
  const { company, index } = row
  return html`<li class="result-row">
    <div class="result-main">
      <a class="result-title" href="/company/${company.id}">${company.name}</a>
      <div class="result-meta">
        ${company.industry ? html`<span class="tag">${company.industry}</span>` : ''}
        ${company.region ? html`<span class="tag">${company.region}</span>` : ''}
        <span class="muted">${index.total} 条情报 · 最近 ${index.latestAt ? relativeTime(index.latestAt) : '无'}</span>
      </div>
    </div>
    <div class="result-side">
      ${indexBadge(index, { size: 'sm' })}
      <span class="result-verdict">${index.grade == null ? '情报不足' : index.gradeTitle}</span>
    </div>
  </li>`
}

// ------------------------------------------------------------------ 厂家页

export function companyPage({ company, index, reports, comments, products, counts = {}, query, user }) {
  const verdictKeys = VERDICTS
  const breakdown = Object.keys(verdictKeys)
    .map((k) => ({ key: k, n: index.verdictCounts[k] || 0 }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n)

  const isOwner = Boolean(user) && company.user_id != null
    && Number(company.user_id) === Number(user.id)
  const affected = Number(counts.reports || 0) + Number(counts.comments || 0)
    + Number(counts.products || 0)

  return layout({
    title: company.name,
    query,
    user,
    body: html`
    <section class="card company-head">
      <div class="company-head-main">
        <h1>${company.name}</h1>
        <div class="company-meta">
          ${company.industry ? html`<span class="tag">${company.industry}</span>` : ''}
          ${company.region ? html`<span class="tag">${company.region}</span>` : ''}
          ${company.website ? html`<a class="tag link" href="${company.website}" rel="nofollow noopener noreferrer" target="_blank">官网</a>` : ''}
          <span class="tag">收录于 ${formatDate(company.created_at)}</span>
        </div>
        ${company.aliases ? html`<p class="muted small">别名：${company.aliases.split('|').filter(Boolean).join('、')}</p>` : ''}
        ${company.note ? html`<p class="company-note">${company.note}</p>` : ''}
      </div>
      <div class="company-head-side">
        ${indexBadge(index, { size: 'lg' })}
        <div class="company-side-caption">
          <strong>${index.grade == null ? '样本不足以下结论' : index.gradeTitle}</strong>
          <span>${confidenceNote(index)} · 有效情报 ${index.effective} 条</span>
          <span class="muted small">最近更新：${index.latestAt ? relativeTime(index.latestAt) : '—'}</span>
        </div>
      </div>
    </section>

    ${isOwner ? html`<section class="card owner-panel">
      <div class="owner-panel-head">
        <span class="own-badge">我建立的厂家</span>
        <span class="muted small">这个条目是你创建的，你可以删除它。</span>
      </div>
      <p class="muted small">
        ${affected > 0
          ? html`删除会<strong>连带删除</strong>它下面的
              ${Number(counts.reports || 0)} 条情报、${Number(counts.comments || 0)} 条评论、
              ${Number(counts.products || 0)} 个产品关联——其中可能包含<strong>其他人贡献的内容</strong>。
              此操作不可撤销。`
          : html`目前它下面还没有任何情报、评论或产品关联，删除不会牵连别人的贡献。`}
      </p>
      <form class="inline-form" action="/companies/${company.id}/delete" method="post"
            onsubmit="return confirm('确定删除这个厂家吗？它下面的情报、评论和产品关联会一并删除，且无法恢复。')">
        <button class="btn btn-danger" type="submit">删除这个厂家</button>
      </form>
    </section>` : ''}

    <div class="grid grid-2">
      <section class="card">
        <h2>休息情况分布</h2>
        ${breakdown.length
          ? html`<ul class="breakdown">${breakdown.map((b) => html`<li>
              <span class="bd-label">${VERDICTS[b.key].label}</span>
              <span class="bd-bar"><i style="width:${Math.round((b.n / index.total) * 100)}%"></i></span>
              <span class="bd-n">${b.n}</span>
            </li>`)}</ul>`
          : html`<p class="muted">还没有情报。如果你了解这家厂子，欢迎上传。</p>`}
        <p class="muted small">指数的计算方式：每条情报按新鲜度（半衰期 400 天）加权后折算成 0–100 的分数，
          <strong>不区分信息来源</strong>。详见<a href="/about">关于页</a>。</p>
      </section>

      <section class="card">
        <h2>相关产品</h2>
        ${products.length
          ? html`<ul class="tag-list">${products.map((p) => html`<li>
              <span class="tag">${p.name}${p.brand ? html` · ${p.brand}` : ''}</span>
            </li>`)}</ul>`
          : html`<p class="muted">还没有建立产品关联。</p>`}
        <div class="empty-actions">
          <a class="btn" href="/product/new?company_id=${company.id}">补充该厂的产品</a>
          <a class="btn btn-primary" href="/report/new?company_id=${company.id}">上传双休情报</a>
        </div>
      </section>
    </div>

    <section class="card">
      <h2>用户上传的双休情报 <small>共 ${reports.length} 条</small></h2>
      ${reports.length
        ? html`<ul class="report-list">${reports.map((r) => reportItem(r, user))}</ul>`
        : emptyState('这家厂家还没有任何情报', '第一手上传最有价值，请尽量把作息讲清楚。',
            html`<a class="btn btn-primary" href="/report/new?company_id=${company.id}">上传双休情报</a>`)}
    </section>

    <section class="card" id="comments">
      <h2>评论 <small>共 ${comments.length} 条</small></h2>
      ${comments.length
        ? html`<ul class="comment-list">${comments.map((c) => commentItem(c, user))}</ul>`
        : html`<p class="muted">还没有评论。可以补充你听说的消息，或对上面的情报提出异议。</p>`}

      ${user
        ? html`<p class="muted small">当前身份 <strong>${user.nickname}</strong>：发布后你可以随时编辑或删除自己的评论。</p>`
        : html`<p class="muted small">你现在是<strong>匿名发布</strong>，发布后无法修改。
            <a href="/login?next=${encodeURIComponent(`/company/${company.id}`)}">游客登录</a>后即可管理自己的内容。</p>`}

      <form class="form comment-form" action="/comments" method="post">
        <input type="hidden" name="company_id" value="${company.id}">
        ${user
          ? html`<div class="form-row">
              <label>署名</label>
              <p class="identity-line">将以 <strong>${user.nickname}</strong> 的身份发布</p>
            </div>`
          : html`<div class="form-row">
              <label for="nickname">昵称（可留空）</label>
              <input id="nickname" name="nickname" maxlength="24" placeholder="匿名工友">
            </div>`}
        <div class="form-row">
          <label for="content">评论内容<span class="req">*</span></label>
          <textarea id="content" name="content" rows="4" maxlength="1000" required
                    placeholder="例如：我 2023 年在这家做过，名义双休但每月至少两个周六要值班。"></textarea>
          <p class="hint">请不要写真实姓名、工号、手机号等可识别个人身份的信息。</p>
        </div>
        <div class="form-row hp-row" aria-hidden="true">
          <label for="website_hp">网址</label>
          <input id="website_hp" name="website_hp" tabindex="-1" autocomplete="off">
        </div>
        <button class="btn btn-primary" type="submit">发布评论</button>
      </form>
    </section>
  `,
  })
}

function reportItem(r, user = null) {
  const emp = EMPLOYMENTS[r.employment]?.label || '不便透露'
  const own = Boolean(user) && r.user_id != null && Number(r.user_id) === Number(user.id)
  const facts = []
  if (r.schedule) facts.push(['作息', r.schedule])
  if (r.rest_days != null) facts.push(['每周休息', `${r.rest_days} 天`])
  if (r.weekly_hours != null) facts.push(['每周工时', `${r.weekly_hours} 小时`])
  if (r.overtime) facts.push(['加班', r.overtime])
  if (r.make_up_work) facts.push(['调休', '存在周末调休上班'])
  if (r.position) facts.push(['岗位', r.position])
  facts.push(['状态', emp])

  return html`<li class="report">
    <div class="report-head">
      <div class="report-head-left">
        ${verdictChip(r.verdict)}
        ${own ? html`<span class="own-badge">我上传的</span>` : ''}
      </div>
      <div class="report-head-right">
        <span class="report-time" title="${formatDateTime(r.created_at)}">${relativeTime(r.created_at)}</span>
        ${own ? html`<form class="inline-form" action="/reports/${r.id}/delete" method="post">
          <button class="link-btn danger" type="submit"
                  onclick="return confirm('确定删除这条情报吗？删除后无法恢复。')">删除</button>
        </form>` : ''}
      </div>
    </div>
    <dl class="report-facts">
      ${facts.map(([k, v]) => html`<div><dt>${k}</dt><dd>${v}</dd></div>`)}
    </dl>
    ${r.detail ? html`<p class="report-detail">${r.detail}</p>` : ''}
    ${r.evidence ? html`<p class="report-evidence">佐证：<a href="${r.evidence}" rel="nofollow noopener noreferrer" target="_blank">${r.evidence}</a></p>` : ''}
  </li>`
}

function commentItem(c, user = null) {
  const own = Boolean(user) && c.user_id != null && Number(c.user_id) === Number(user.id)
  return html`<li class="comment">
    <div class="comment-head">
      <span class="comment-nick">${c.nickname || '匿名工友'}</span>
      ${own ? html`<span class="own-badge">我发布的</span>` : ''}
      <span class="comment-time" title="${formatDateTime(c.created_at)}">${relativeTime(c.created_at)}</span>
      ${own ? html`<span class="comment-actions">
        <a class="link-btn" href="/comments/${c.id}/edit">编辑</a>
        <form class="inline-form" action="/comments/${c.id}/delete" method="post">
          <button class="link-btn danger" type="submit"
                  onclick="return confirm('确定删除这条评论吗？删除后无法恢复。')">删除</button>
        </form>
      </span>` : ''}
    </div>
    <div class="comment-body">${c.content}</div>
  </li>`
}

// ------------------------------------------------------------------ 表单页

function errorList(errors) {
  if (!errors || !errors.length) return ''
  return html`<div class="notice notice-err" role="alert">
    <ul>${errors.map((e) => html`<li>${e}</li>`)}</ul>
  </div>`
}

export function newReportPage({ company, companies, values, errors, query, presetCompanyId, user }) {
  const v = values || {}
  return layout({
    title: '上传双休情报',
    query,
    current: '/report/new',
    user,
    body: html`
    <section class="card">
      <h1 class="page-title">上传双休情报</h1>
      <p class="muted">你上传的内容会直接出现在对应厂家的页面上。
        请只写你确实知道的事，尽量把作息讲具体——含糊的描述对别人没有帮助。</p>
      ${errorList(errors)}
      <form class="form" action="/reports" method="post">
        <div class="form-row">
          <label for="company_id">生产厂家<span class="req">*</span></label>
          ${companies.length
            ? html`<select id="company_id" name="company_id" required>
                <option value="">— 请选择厂家 —</option>
                ${companies.map((c) => html`<option value="${c.id}" ${String(c.id) === String(v.company_id ?? presetCompanyId ?? '') ? raw('selected') : ''}>${c.name}${c.region ? `（${c.region}）` : ''}</option>`)}
              </select>`
            : html`<p class="muted">还没有任何厂家记录，请先<a href="/company/new">新建一个厂家</a>。</p>`}
          <p class="hint">找不到？先<a href="/company/new">新建厂家</a>，再回来上传。也可以在本页下方直接新建。</p>
        </div>

        <fieldset class="form-row">
          <legend>每周实际休息情况<span class="req">*</span></legend>
          <div class="radio-grid">
            ${Object.entries(VERDICTS).map(([key, def]) => html`<label class="radio-card">
              <input type="radio" name="verdict" value="${key}" ${v.verdict === key ? raw('checked') : ''} required>
              <span class="radio-title">${def.label}</span>
              <span class="radio-desc">${def.desc}</span>
            </label>`)}
          </div>
        </fieldset>

        <div class="form-grid">
          <div class="form-row">
            <label for="schedule">作息描述</label>
            <input id="schedule" name="schedule" maxlength="160" value="${v.schedule || ''}"
                   placeholder="例如：9:00–18:00，周一至周五">
          </div>
          <div class="form-row">
            <label for="rest_days">每周实际休息天数</label>
            <input id="rest_days" name="rest_days" type="number" inputmode="decimal"
                   step="0.5" min="0" max="7" value="${v.rest_days ?? ''}" placeholder="2">
          </div>
          <div class="form-row">
            <label for="weekly_hours">每周实际工时（小时）</label>
            <input id="weekly_hours" name="weekly_hours" type="number" inputmode="decimal"
                   step="0.5" min="0" max="168" value="${v.weekly_hours ?? ''}" placeholder="40">
          </div>
          <div class="form-row">
            <label for="overtime">加班情况</label>
            <input id="overtime" name="overtime" maxlength="160" value="${v.overtime || ''}"
                   placeholder="例如：平时基本不加班，月末偶尔加到 20:00">
          </div>
          <div class="form-row">
            <label for="position">你的岗位</label>
            <input id="position" name="position" maxlength="60" value="${v.position || ''}" placeholder="例如：质检、装配线">
          </div>
          <div class="form-row">
            <label for="employment">在职状态</label>
            <select id="employment" name="employment">
              ${Object.entries(EMPLOYMENTS).map(([key, def]) => html`<option value="${key}" ${(v.employment || 'unknown') === key ? raw('selected') : ''}>${def.label}</option>`)}
            </select>
          </div>
        </div>

        <div class="form-row checkbox-row">
          <label><input type="checkbox" name="make_up_work" value="1" ${v.make_up_work ? raw('checked') : ''}>
            存在「周末调休上班 / 大小周轮换」</label>
        </div>

        <div class="form-row">
          <label for="detail">补充说明<span class="req">*</span></label>
          <textarea id="detail" name="detail" rows="5" maxlength="1500"
                    placeholder="尽量写具体：什么时候、什么部门、周末怎么安排、有没有补休或加班费。">${v.detail || ''}</textarea>
          <p class="hint">若来源选「我本人在此工作」，这里至少写 10 个字。</p>
        </div>

        <div class="form-row">
          <label for="evidence">佐证链接（可选）</label>
          <input id="evidence" name="evidence" maxlength="300" value="${v.evidence || ''}" placeholder="https://…（招聘页、公告、报道）">
        </div>

        <div class="form-row hp-row" aria-hidden="true">
          <label for="website_hp">网址</label>
          <input id="website_hp" name="website_hp" tabindex="-1" autocomplete="off">
        </div>

        <button class="btn btn-primary" type="submit">提交情报</button>
      </form>
    </section>

    <section class="card subtle">
      <h2>顺便新建一个厂家</h2>
      <p class="muted">如果上面列表里找不到你要说的厂子，可以直接在这里建。</p>
      <form class="form form-inline" action="/companies" method="post">
        <input type="hidden" name="redirect_to" value="report">
        <div class="form-row">
          <label for="name">厂家名称<span class="req">*</span></label>
          <input id="name" name="name" maxlength="80" required placeholder="例如：某某精密制造有限公司">
        </div>
        <div class="form-row">
          <label for="region">所在地</label>
          <input id="region" name="region" maxlength="60" placeholder="例如：广东 深圳">
        </div>
        <div class="form-row">
          <label for="industry">行业</label>
          <input id="industry" name="industry" maxlength="60" placeholder="例如：消费电子代工">
        </div>
        <button class="btn" type="submit">新建厂家</button>
      </form>
    </section>
  `,
  })
}

export function newCompanyPage({ values, errors, query, presetName, user }) {
  const v = values || {}
  return layout({
    title: '新建厂家',
    query,
    user,
    body: html`
    <section class="card">
      <h1 class="page-title">新建厂家</h1>
      <p class="muted">只填写你确定的信息。名称会做归一化处理，「某某有限公司」和「某某」会被视为同一家。</p>
      ${errorList(errors)}
      <form class="form" action="/companies" method="post">
        <div class="form-row">
          <label for="name">厂家名称<span class="req">*</span></label>
          <input id="name" name="name" maxlength="80" required value="${v.name || presetName || ''}"
                 placeholder="例如：某某精密制造有限公司">
        </div>
        <div class="form-row">
          <label for="aliases">别名 / 曾用名</label>
          <input id="aliases" name="aliases" maxlength="200" value="${v.aliases || ''}"
                 placeholder="多个用 | 分隔，例如：某某精密|XX Precision">
        </div>
        <div class="form-grid">
          <div class="form-row">
            <label for="industry">行业</label>
            <input id="industry" name="industry" maxlength="60" value="${v.industry || ''}" placeholder="例如：纺织服装">
          </div>
          <div class="form-row">
            <label for="region">所在地</label>
            <input id="region" name="region" maxlength="60" value="${v.region || ''}" placeholder="例如：浙江 宁波">
          </div>
        </div>
        <div class="form-row">
          <label for="website">官网（可选）</label>
          <input id="website" name="website" maxlength="200" value="${v.website || ''}" placeholder="https://…">
        </div>
        <div class="form-row">
          <label for="note">备注</label>
          <textarea id="note" name="note" rows="3" maxlength="500"
                    placeholder="例如：主要给哪些品牌代工。">${v.note || ''}</textarea>
        </div>
        <div class="form-row hp-row" aria-hidden="true">
          <label for="website_hp">网址</label>
          <input id="website_hp" name="website_hp" tabindex="-1" autocomplete="off">
        </div>
        <button class="btn btn-primary" type="submit">建立厂家页面</button>
      </form>
    </section>
  `,
  })
}

export function newProductPage({ companies, values, errors, query, presetCompanyId, presetName, user }) {
  const v = values || {}
  return layout({
    title: '提交产品与厂家的关联',
    query,
    user,
    body: html`
    <section class="card">
      <h1 class="page-title">提交「产品 → 生产厂家」关联</h1>
      <p class="muted">这是让搜索能命中厂家的关键一步。填一次，之后任何人搜这个产品都能看到该厂的双休指数。</p>
      ${errorList(errors)}
      ${companies.length === 0
        ? html`<p class="notice notice-err">还没有任何厂家记录，请先<a href="/company/new">新建厂家</a>。</p>`
        : html`<form class="form" action="/products" method="post">
            <div class="form-row">
              <label for="name">产品名称<span class="req">*</span></label>
              <input id="name" name="name" maxlength="100" required value="${v.name || presetName || ''}"
                     placeholder="例如：XX 牌 4L 电饭煲 / 型号 ABC-123">
            </div>
            <div class="form-grid">
              <div class="form-row">
                <label for="brand">品牌</label>
                <input id="brand" name="brand" maxlength="60" value="${v.brand || ''}" placeholder="例如：某品牌">
              </div>
              <div class="form-row">
                <label for="category">品类</label>
                <input id="category" name="category" maxlength="60" value="${v.category || ''}" placeholder="例如：小家电">
              </div>
              <div class="form-row">
                <label for="barcode">条形码（可选）</label>
                <input id="barcode" name="barcode" maxlength="40" value="${v.barcode || ''}" placeholder="6901234567890">
              </div>
            </div>
            <div class="form-row">
              <label for="company_id">生产厂家<span class="req">*</span></label>
              <select id="company_id" name="company_id" required>
                <option value="">— 请选择厂家 —</option>
                ${companies.map((c) => html`<option value="${c.id}" ${String(c.id) === String(v.company_id ?? presetCompanyId ?? '') ? raw('selected') : ''}>${c.name}${c.region ? `（${c.region}）` : ''}</option>`)}
              </select>
              <p class="hint">列表里没有？<a href="/company/new">先新建厂家</a>。</p>
            </div>
            <div class="form-row hp-row" aria-hidden="true">
              <label for="website_hp">网址</label>
              <input id="website_hp" name="website_hp" tabindex="-1" autocomplete="off">
            </div>
            <button class="btn btn-primary" type="submit">提交关联</button>
          </form>`}
    </section>
  `,
  })
}

// ------------------------------------------------------------------ 游客登录

export function loginPage({ values, errors, query, next = '/', user }) {
  const v = values || {}
  return layout({
    title: '登录',
    query,
    user,
    body: html`
    <section class="card login-card">
      <h1 class="page-title">${user ? '切换身份' : '登录或注册'}</h1>
      <p class="muted">注册账号、登录已有账号，或者不注册直接开始——三种方式按需选一种。</p>
      ${errorList(errors)}
      ${user ? html`<div class="notice notice-ok">
        你当前的身份是 <strong>${user.nickname}</strong>${user.username
          ? html`（账号 <strong>${user.username}</strong>）`
          : html`（尚未设置账号密码）`}。
        ${user.username
          ? '要换成别的身份，请先退出当前账号。'
          : '在下面登录别的身份会覆盖当前身份；已发布的内容不会转移过去。'}
      </div>` : ''}

      <div class="login-grid">
        <div class="login-block">
          <h2>注册新账号</h2>
          <p class="muted small">填一次就好。之后换设备、清了 Cookie，用用户名和密码登录就能找回身份。</p>
          <form class="form" action="/register" method="post">
            <input type="hidden" name="next" value="${next}">
            <div class="form-row">
              <label for="reg_username">用户名<span class="req">*</span></label>
              <input id="reg_username" name="username" maxlength="32" required
                     value="${v.username || ''}" autocomplete="username"
                     placeholder="3–32 位，中文 / 字母 / 数字 / 下划线">
            </div>
            <div class="form-row">
              <label for="reg_nickname">昵称（留空就用用户名）</label>
              <input id="reg_nickname" name="nickname" maxlength="24" value="${v.nickname || ''}"
                     placeholder="别人看到的名字">
            </div>
            <div class="form-row">
              <label for="reg_password">密码<span class="req">*</span></label>
              <input id="reg_password" name="password" type="password" required minlength="8"
                     autocomplete="new-password">
              <p class="hint">至少 8 位。</p>
            </div>
            <div class="form-row">
              <label for="reg_confirm">再输一次密码<span class="req">*</span></label>
              <input id="reg_confirm" name="confirm" type="password" required minlength="8"
                     autocomplete="new-password">
            </div>
            <div class="form-row hp-row" aria-hidden="true">
              <label for="hp_reg">网址</label>
              <input id="hp_reg" name="website_hp" tabindex="-1" autocomplete="off">
            </div>
            <button class="btn btn-primary" type="submit">注册并开始</button>
          </form>
        </div>

        <div class="login-block">
          <h2>已有账号</h2>
          <form class="form" action="/login/password" method="post">
            <input type="hidden" name="next" value="${next}">
            <div class="form-row">
              <label for="login_username">用户名</label>
              <input id="login_username" name="username" maxlength="32" required
                     value="${v.username || ''}" autocomplete="username">
            </div>
            <div class="form-row">
              <label for="login_password">密码</label>
              <input id="login_password" name="password" type="password" required
                     autocomplete="current-password">
            </div>
            <div class="form-row hp-row" aria-hidden="true">
              <label for="hp_account">网址</label>
              <input id="hp_account" name="website_hp" tabindex="-1" autocomplete="off">
            </div>
            <button class="btn btn-primary" type="submit">登录</button>
          </form>

          <div class="login-divider"><span>或者</span></div>

          <h2>不注册，直接开始</h2>
          <p class="muted small">只填一个昵称就能发布内容，之后随时可以补设密码。</p>
          <form class="form" action="/login" method="post">
            <input type="hidden" name="next" value="${next}">
            <div class="form-row">
              <label for="nickname">昵称</label>
              <input id="nickname" name="nickname" maxlength="24" required
                     value="${v.nickname || ''}" placeholder="例如：前质检员、匿名工友">
              <p class="hint">建议不要用真名，也不要用能定位到你个人的名字。</p>
            </div>
            <div class="form-row hp-row" aria-hidden="true">
              <label for="hp_guest">网址</label>
              <input id="hp_guest" name="website_hp" tabindex="-1" autocomplete="off">
            </div>
            <button class="btn" type="submit">开始</button>
          </form>
        </div>
      </div>

      <div class="login-note">
        <h2>为什么要密码，又为什么不强制</h2>
        <p class="muted small">密码唯一的用途是<strong>换设备时把身份找回来</strong>，
          好让你继续管理自己发布的内容——评论可以编辑、删除，情报和产品关联可以删除。</p>
        <p class="muted small">本站不要你的邮箱或手机号。代价是<strong>忘记密码就找不回来了</strong>，
          没有找回流程。</p>
        <p class="muted small">即使不登录也能上传情报和发表评论，只是发布之后无法再修改。</p>
      </div>
    </section>
  `,
  })
}

export function accountPage({ user, errors, values, query }) {
  const v = values || {}
  const hasAcct = Boolean(user.username && user.password_hash)
  return layout({
    title: '账号设置',
    query,
    user,
    body: html`
    <section class="card login-card">
      <h1 class="page-title">${hasAcct ? '账号与密码' : '设置账号密码'}</h1>

      ${hasAcct ? html`
        <p class="muted">你的用户名是 <strong>${user.username}</strong>。
          换设备或清除 Cookie 后，用它和密码登录就能把身份找回来，
          已发布的内容和编辑权都还在。</p>
        <div class="notice notice-ok">已设置账号密码，退出后可以重新登录。</div>
        ${errorList(errors)}
        <form class="form" action="/account" method="post">
          <input type="hidden" name="mode" value="change">
          <div class="form-row">
            <label for="current_password">当前密码<span class="req">*</span></label>
            <input id="current_password" name="current_password" type="password" required
                   autocomplete="current-password">
          </div>
          <div class="form-row">
            <label for="password">新密码<span class="req">*</span></label>
            <input id="password" name="password" type="password" required minlength="8"
                   autocomplete="new-password">
            <p class="hint">至少 8 位。建议不要与其他网站共用。</p>
          </div>
          <div class="form-row">
            <label for="confirm">再输一次新密码<span class="req">*</span></label>
            <input id="confirm" name="confirm" type="password" required minlength="8"
                   autocomplete="new-password">
          </div>
          <div class="form-row hp-row" aria-hidden="true">
            <label for="hp_chg">网址</label>
            <input id="hp_chg" name="website_hp" tabindex="-1" autocomplete="off">
          </div>
          <button class="btn btn-primary" type="submit">修改密码</button>
        </form>
      ` : html`
        <p class="muted">设置一个用户名和密码，之后即使换了设备、清除了 Cookie，
          也能重新登录回来，继续管理你发布的内容。</p>
        <p class="muted small">不设置也可以正常使用，但身份只活在当前浏览器的 Cookie 里，
          一旦清除就再也找不回来了。</p>
        ${errorList(errors)}
        <form class="form" action="/account" method="post">
          <input type="hidden" name="mode" value="create">
          <div class="form-row">
            <label for="username">用户名<span class="req">*</span></label>
            <input id="username" name="username" maxlength="32" required
                   value="${v.username || ''}" autocomplete="username"
                   placeholder="3–32 位，中文 / 字母 / 数字 / 下划线">
          </div>
          <div class="form-row">
            <label for="password">密码<span class="req">*</span></label>
            <input id="password" name="password" type="password" required minlength="8"
                   autocomplete="new-password">
            <p class="hint">至少 8 位。建议不要与其他网站共用。</p>
          </div>
          <div class="form-row">
            <label for="confirm">再输一次<span class="req">*</span></label>
            <input id="confirm" name="confirm" type="password" required minlength="8"
                   autocomplete="new-password">
          </div>
          <div class="form-row hp-row" aria-hidden="true">
            <label for="hp_set">网址</label>
            <input id="hp_set" name="website_hp" tabindex="-1" autocomplete="off">
          </div>
          <button class="btn btn-primary" type="submit">保存并启用</button>
        </form>
      `}

      <div class="login-note">
        <h2>关于安全</h2>
        <p class="muted small">密码用 PBKDF2-SHA256 加每用户独立随机盐派生后保存，
          数据库里没有明文，服务端也无法还原。但本站没有邮箱验证，
          <strong>忘记密码就真的找不回来了</strong>。</p>
        <p class="muted small">用户名不区分大小写，已被占用的无法重复使用；设置后不能改名。</p>
      </div>
    </section>
  `,
  })
}

export function mePage({ user, reports, comments, products = [], companies = [], query }) {
  const hasAcct = Boolean(user.username && user.password_hash)
  return layout({
    title: '我的贡献',
    query,
    user,
    body: html`
    <section class="card">
      <h1 class="page-title">我的贡献</h1>
      <p class="muted">当前身份 <strong>${user.nickname}</strong>，创建于 ${formatDate(user.created_at)}。</p>
      ${hasAcct
        ? html`<p class="muted small">账号 <strong>${user.username}</strong> ·
            换设备后可以用它和密码重新登录。<a href="/account">修改密码</a></p>`
        : html`<div class="notice notice-warn">
            你还没有设置账号密码。这个身份只存在于当前浏览器的 Cookie 里，
            <strong>清除 Cookie 或换设备后就再也找不回来了</strong>，你发布的内容也将无法再管理。
            <a href="/account">现在设置</a>
          </div>`}
    </section>

    <section class="card">
      <h2>我上传的双休情报 <small>共 ${reports.length} 条</small></h2>
      ${reports.length
        ? html`<ul class="me-list">${reports.map((r) => html`<li>
            <a href="/company/${r.company_id}">${r.company_name}</a>
            ${verdictChip(r.verdict)}
            <span class="muted small">${relativeTime(r.created_at)}</span>
            <form class="inline-form" action="/reports/${r.id}/delete" method="post">
              <button class="link-btn danger" type="submit"
                      onclick="return confirm('确定删除这条情报吗？删除后无法恢复。')">删除</button>
            </form>
          </li>`)}</ul>`
        : html`<p class="muted">还没有上传过情报。<a href="/report/new">去上传一条</a>。</p>`}
    </section>

    <section class="card">
      <h2>我发布的评论 <small>共 ${comments.length} 条</small></h2>
      ${comments.length
        ? html`<ul class="me-list me-comments">${comments.map((c) => html`<li>
            <a href="/company/${c.company_id}">${c.company_name}</a>
            <span class="muted small">${relativeTime(c.created_at)}</span>
            <span class="me-content">${c.content}</span>
            <span class="me-actions">
              <a class="link-btn" href="/comments/${c.id}/edit">编辑</a>
              <form class="inline-form" action="/comments/${c.id}/delete" method="post">
                <button class="link-btn danger" type="submit"
                        onclick="return confirm('确定删除这条评论吗？删除后无法恢复。')">删除</button>
              </form>
            </span>
          </li>`)}</ul>`
        : html`<p class="muted">还没有发表过评论。</p>`}
    </section>

    <section class="card">
      <h2>我提交的产品关联 <small>共 ${products.length} 条</small></h2>
      ${products.length
        ? html`<ul class="me-list">${products.map((p) => html`<li>
            <span class="me-title">${p.name}</span>
            <span class="muted small">→ <a href="/company/${p.company_id}">${p.company_name}</a></span>
            <span class="muted small">${relativeTime(p.created_at)}</span>
            <span class="me-actions">
              <form class="inline-form" action="/products/${p.id}/delete" method="post">
                <button class="link-btn danger" type="submit"
                        onclick="return confirm('确定删除这条产品关联吗？删除后搜索就找不到这个产品了。')">删除</button>
              </form>
            </span>
          </li>`)}</ul>`
        : html`<p class="muted">还没有提交过产品关联。</p>`}
    </section>

    <section class="card">
      <h2>我建立的厂家 <small>共 ${companies.length} 个</small></h2>
      ${companies.length
        ? html`<ul class="me-list">${companies.map((c) => html`<li>
            <span class="me-title"><a href="/company/${c.id}">${c.name}</a></span>
            <span class="muted small">${c.report_count} 条情报 · ${c.comment_count} 条评论 · ${c.product_count} 个产品</span>
            <span class="me-actions">
              <form class="inline-form" action="/companies/${c.id}/delete" method="post"
                    onsubmit="return confirm('确定删除这个厂家吗？它下面的情报、评论和产品关联会一并删除，且无法恢复。')">
                <button class="link-btn danger" type="submit">删除</button>
              </form>
            </span>
          </li>`)}</ul>`
        : html`<p class="muted">还没有建立过厂家。</p>`}
    </section>
  `,
  })
}

export function editCommentPage({ comment, company, values, errors, query, user }) {
  const v = values || {}
  return layout({
    title: '编辑评论',
    query,
    user,
    body: html`
    <section class="card">
      <h1 class="page-title">编辑评论</h1>
      <p class="muted">这条评论发布在厂家「<a href="/company/${company.id}">${company.name}</a>」的页面下。</p>
      ${errorList(errors)}
      <form class="form" action="/comments/${comment.id}/edit" method="post">
        <div class="form-row">
          <label>署名</label>
          <p class="identity-line">以 <strong>${user.nickname}</strong> 的身份显示</p>
        </div>
        <div class="form-row">
          <label for="content">评论内容<span class="req">*</span></label>
          <textarea id="content" name="content" rows="6" maxlength="1000" required>${v.content ?? comment.content}</textarea>
        </div>
        <div class="form-row hp-row" aria-hidden="true">
          <label for="website_hp">网址</label>
          <input id="website_hp" name="website_hp" tabindex="-1" autocomplete="off">
        </div>
        <div class="form-actions">
          <button class="btn btn-primary" type="submit">保存修改</button>
          <a class="btn" href="/company/${company.id}#comments">取消</a>
        </div>
      </form>
    </section>
  `,
  })
}

// ------------------------------------------------------------------ 关于页

export function aboutPage({ query, stats, user }) {
  return layout({
    title: '关于与数据来源',
    query,
    user,
    body: html`
    <section class="card prose">
      <h1>关于「休沐选」</h1>
      <p>「休沐」是古人对休假的说法。这个站点只做一件事：
        <strong>让「这家厂子到底双休吗」有一个可以查、可以补充、可以被质疑的地方。</strong></p>

      <h2>数据从哪里来</h2>
      <p>全部来自像你一样的用户上传。<strong>本站没有爬取任何企业数据，也没有官方数据源。</strong>
        目前共有 ${stats.reports} 条情报、${stats.comments} 条评论、${stats.companies} 个厂家条目。</p>
      <p>这意味着两件事：查不到是正常的；而每一条你上传的信息，都会立刻改变别人的搜索结果。</p>

      <h2>指数怎么算</h2>
      <p>每条情报先换算成一个 0–1 的分数：双休 = 1.0，基本双休 = 0.85，大小周 = 0.4，单休 = 0.1，无休 = 0，
        「说不清」不计入评分。</p>
      <p>然后按<strong>新鲜度</strong>加权平均：每条情报按 400 天半衰期衰减，越近的权重越高。</p>
      <p>本站<strong>不区分信息来源</strong>——不问你是本人亲历、亲友转述，还是看到的公开信息，
        所有情报一视同仁。防刷依靠提交频率限制、内容去重，以及下面这条样本门槛。</p>
      <p>分数 ≥85 为 A，≥70 为 B，≥50 为 C，≥30 为 D，其余为 E。
        有效情报少于 3 条时，本站<strong>不给出等级</strong>，只显示「样本不足」——
        一两个人的说法不足以定义一个厂家。</p>

      <h2>这个站不做什么</h2>
      <ul>
        <li>不核实任何一条上传内容，也不对企业作出法律意义上的评价。</li>
        <li>不保存上传者的明文 IP，只保存加盐哈希用于防刷。</li>
        <li>发布内容不需要登录；账号密码是可选的，只用于换设备时找回身份。</li>
      </ul>

      <h2>免责声明</h2>
      <p>本站内容均为用户自行发布，未经核实，不构成任何投资、求职或采购建议。
        如果你认为某条内容侵犯了你的合法权益，请联系站点运营者处理。</p>
    </section>
  `,
  })
}

// ------------------------------------------------------------------ 错误页

export function notFoundPage({ query, user = null }) {
  return layout({
    title: '找不到页面',
    query,
    user,
    body: html`<section class="card">
      ${emptyState('404 · 找不到这个页面', '也许链接过期了，或者这个厂家还没被收录。',
        html`<div class="empty-actions">
          <a class="btn btn-primary" href="/">回到首页</a>
          <a class="btn" href="/report/new">上传一条情报</a>
        </div>`)}
    </section>`,
  })
}

export function errorPage({ message }) {
  return html`<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>服务器错误 · ${SITE.name}</title>
<link rel="stylesheet" href="/style.css"></head>
<body><main class="container"><section class="card">
<h1>500 · 服务器出了点问题</h1>
<p class="muted">请稍后再试。如果反复出现，请联系站长。</p>
<pre class="error-detail">${message}</pre>
</main></body></html>`
}

export { escapeHtml }
