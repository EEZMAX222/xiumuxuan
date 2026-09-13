/**
 * 内置静态资源。
 * 放在 JS 里而不是 public/ 目录，是为了让 Node 与 Cloudflare Workers
 * 两种运行时共用同一份资源、且都不需要文件系统读取。
 */

export const STYLE_CSS = `/* 休沐选 — 样式表 */
:root{
  --bg:#f5f6f8;
  --card:#ffffff;
  --ink:#151a21;
  --ink-soft:#3d4652;
  --muted:#6d7783;
  --line:#e3e7ec;
  --line-soft:#eef1f4;
  --brand:#0f766e;
  --brand-ink:#0b5c56;
  --brand-soft:#e6f2f0;
  --good:#127a56;
  --warn:#b45309;
  --bad:#b42318;
  --radius:14px;
  --shadow:0 1px 2px rgba(16,24,40,.04), 0 8px 24px -16px rgba(16,24,40,.18);
}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{
  margin:0;background:var(--bg);color:var(--ink);
  font-family:system-ui,-apple-system,"Segoe UI","Noto Sans SC","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;
  font-size:15px;line-height:1.65;
  /* 刘海屏横屏时两侧不被遮挡；不支持 env() 的浏览器取 0，无副作用 */
  padding-left:env(safe-area-inset-left);
  padding-right:env(safe-area-inset-right);
}
a{color:var(--brand-ink);text-decoration:none}
a:hover{text-decoration:underline}
h1,h2,h3{line-height:1.35;margin:0 0 12px}
h1{font-size:24px}
h2{font-size:18px}
h3{font-size:16px}
small{font-weight:400;color:var(--muted);font-size:13px}
code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:.9em;background:var(--line-soft);padding:2px 6px;border-radius:6px}
.container{max-width:1000px;margin:0 auto;padding:0 20px}

/* ---------- 头部 ---------- */
.site-header{background:var(--card);border-bottom:1px solid var(--line);position:sticky;top:0;z-index:20;
  padding-top:env(safe-area-inset-top)}
.header-inner{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:12px 20px;flex-wrap:wrap}
.brand{display:flex;align-items:center;gap:10px;color:inherit;text-decoration:none}
.brand:hover{text-decoration:none}
.brand-mark{width:38px;height:38px;border-radius:11px;background:var(--brand);color:#fff;display:grid;place-items:center;font-weight:700;font-size:17px;flex:none}
.brand-text strong{display:block;font-size:17px;letter-spacing:.02em}
.brand-text small{display:block;font-size:12px;line-height:1.3}
.nav{display:flex;gap:4px;flex-wrap:wrap;flex:1}
.nav a{padding:7px 12px;border-radius:9px;color:var(--ink-soft);font-size:14px}
.nav a:hover{background:var(--line-soft);text-decoration:none}
.nav a.active{background:var(--brand-soft);color:var(--brand-ink);font-weight:600}

main.container{padding:22px 20px 64px}

/* ---------- 通用块 ---------- */
.card{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);padding:20px;margin-bottom:18px;box-shadow:var(--shadow)}
.card.subtle{background:#fbfcfd;box-shadow:none}
.grid{display:grid;gap:18px}
.grid-2{grid-template-columns:1fr 1fr}
.page-title{margin-top:0}
.muted{color:var(--muted)}
.small{font-size:13px}
.req{color:var(--bad);margin-left:3px}
.hint{font-size:12.5px;color:var(--muted);margin:6px 0 0}

.notice{border-radius:11px;padding:11px 15px;margin:0 0 16px;font-size:14px;border:1px solid}
.notice-ok{background:#e9f7f0;border-color:#bfe6d4;color:#0d6246}
.notice-err{background:#fdeceb;border-color:#f6c9c5;color:#8f2117}
.notice-warn{background:#fdf3e3;border-color:#f2ddb5;color:#8a4b06;line-height:1.75}
.notice-warn a{color:#8a4b06;text-decoration:underline}
.notice ul{margin:0;padding-left:18px}

.empty{text-align:center;padding:26px 12px;color:var(--muted)}
.empty-title{font-size:16px;color:var(--ink);margin:0 0 6px;font-weight:600}
.empty-desc{margin:0 0 16px}
.empty-actions{display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:14px}

/* ---------- 按钮 / 表单 ---------- */
.btn{display:inline-block;padding:10px 17px;border-radius:11px;border:1px solid var(--line);background:var(--card);
  color:var(--ink);font-size:14px;cursor:pointer;font-family:inherit;line-height:1.4}
.btn:hover{background:var(--line-soft);text-decoration:none}
.btn-primary{background:var(--brand);border-color:var(--brand);color:#fff;font-weight:600}
.btn-primary:hover{background:var(--brand-ink);border-color:var(--brand-ink)}

.form{display:block}
.form-row{margin-bottom:16px}
.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:0 18px}
.form label,.form legend{display:block;font-weight:600;font-size:14px;margin-bottom:6px}
.form input[type=text],.form input[type=search],.form input[type=number],.form input[type=url],
.form input[type=password],.form input:not([type]),.form textarea,.form select{
  width:100%;padding:10px 13px;border:1px solid var(--line);border-radius:11px;font-size:14.5px;
  font-family:inherit;background:#fff;color:var(--ink)
}
.form textarea{resize:vertical;line-height:1.6}
.form input:focus,.form textarea:focus,.form select:focus{outline:2px solid var(--brand-soft);border-color:var(--brand)}
.form fieldset{border:0;padding:0;margin:0 0 16px}
.checkbox-row label{display:flex;align-items:center;gap:8px;font-weight:400}
.checkbox-row input{width:auto}
.radio-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:10px}
.radio-card{border:1px solid var(--line);border-radius:12px;padding:11px 13px;cursor:pointer;display:block;background:#fff}
.radio-card:hover{border-color:var(--brand)}
.radio-card input{margin-right:7px}
.radio-title{font-weight:600;font-size:14px}
.radio-desc{display:block;font-size:12.5px;color:var(--muted);margin-top:3px;padding-left:22px}
.form-inline .form-row{margin-bottom:12px}
.hp-row{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}

/* ---------- 首页 ---------- */
.hero{text-align:center;padding:34px 0 10px}
.hero h1{font-size:30px;margin-bottom:8px;letter-spacing:.01em}
.hero-sub{color:var(--muted);max-width:640px;margin:0 auto 22px}
.hero-hint{color:var(--muted);font-size:13.5px;margin-top:14px}
.search-form{display:flex;gap:10px;max-width:660px;margin:0 auto}
.search-form.compact{margin:0;max-width:100%}
.search-input{flex:1;padding:13px 16px;border:1px solid var(--line);border-radius:12px;font-size:15px;font-family:inherit}
.search-input:focus{outline:2px solid var(--brand-soft);border-color:var(--brand)}
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:26px 0 20px}
.stat{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px;text-align:center}
.stat b{display:block;font-size:22px;color:var(--brand-ink)}
.stat span{font-size:12.5px;color:var(--muted)}

/* ---------- 排名 / 动态 ---------- */
.rank-list{list-style:none;padding:0;margin:0}
.rank-row{display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--line-soft)}
.rank-row:last-child{border-bottom:0}
.rank-name{font-weight:600;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rank-place{font-size:12.5px;color:var(--muted)}
.rank-n{font-size:12px;color:var(--muted);white-space:nowrap}
.feed{list-style:none;padding:0;margin:0}
.feed li{padding:11px 0;border-bottom:1px solid var(--line-soft)}
.feed li:last-child{border-bottom:0}
.feed-company{font-weight:600}
.feed-time{font-size:12.5px;color:var(--muted);margin-left:8px}
.feed-desc{font-size:13.5px;color:var(--ink-soft);margin-top:3px}

/* ---------- 指数徽章 ---------- */
.index-badge{display:flex;flex-direction:column;align-items:center;justify-content:center;flex:none;
  width:64px;height:64px;border-radius:16px;border:1px solid var(--line);background:#fbfcfd}
.index-badge .grade{font-size:23px;font-weight:800;line-height:1;letter-spacing:-.02em}
.index-badge .score{font-size:11px;color:var(--muted);margin-top:3px}
.index-badge.size-sm{width:52px;height:52px;border-radius:13px}
.index-badge.size-sm .grade{font-size:18px}
.index-badge.size-sm .score{font-size:10px}
.index-badge.size-lg{width:104px;height:104px;border-radius:20px}
.index-badge.size-lg .grade{font-size:40px}
.index-badge.size-lg .score{font-size:13px}
.tone-good .grade{color:var(--good)}
.tone-warn .grade{color:var(--warn)}
.tone-bad .grade{color:var(--bad)}
.tone-muted .grade{color:var(--muted)}

.chip{display:inline-block;padding:2px 10px;border-radius:999px;font-size:12.5px;border:1px solid;white-space:nowrap}
.chip-good{background:#e9f7f0;border-color:#bfe6d4;color:#0d6246}
.chip-warn{background:#fdf3e3;border-color:#f2ddb5;color:#8a4b06}
.chip-bad{background:#fdeceb;border-color:#f6c9c5;color:#8f2117}
.chip-muted{background:var(--line-soft);border-color:var(--line);color:var(--muted)}
.tag{display:inline-block;background:var(--line-soft);border-radius:7px;padding:2px 8px;font-size:12.5px;color:var(--ink-soft);margin-right:6px}
.tag.link{color:var(--brand-ink)}
.tag-list{list-style:none;padding:0;margin:0;display:flex;flex-wrap:wrap;gap:6px}
.tag-list li{margin:0}
.confidence{font-size:12.5px;color:var(--muted)}
.conf-high{color:var(--good)}
.conf-medium{color:var(--ink-soft)}
.conf-low{color:var(--warn)}

/* ---------- 搜索结果 ---------- */
.result-list{list-style:none;padding:0;margin:0}
.result-row{display:flex;align-items:center;gap:14px;padding:13px 0;border-bottom:1px solid var(--line-soft)}
.result-row:last-child{border-bottom:0}
.result-main{flex:1;min-width:0}
.result-title{font-size:16px;font-weight:600;display:block;margin-bottom:4px}
.result-meta{font-size:13px;color:var(--muted);display:flex;flex-wrap:wrap;align-items:center;gap:6px}
.result-company a{font-weight:500}
.result-side{display:flex;flex-direction:column;align-items:center;gap:5px;flex:none}
.result-verdict{font-size:11.5px;color:var(--muted);text-align:center;max-width:80px}

/* ---------- 厂家页 ---------- */
.company-head{display:flex;gap:20px;align-items:flex-start;justify-content:space-between;flex-wrap:wrap}
.company-head-main{flex:1;min-width:240px}
.company-head-main h1{margin-bottom:10px}
.company-meta{display:flex;flex-wrap:wrap;align-items:center;gap:0;margin-bottom:8px}
.company-note{margin:10px 0 0;color:var(--ink-soft);font-size:14px}
.company-head-side{display:flex;gap:14px;align-items:center;flex:none}
.company-side-caption{display:flex;flex-direction:column;gap:3px;font-size:13px;color:var(--muted)}
.company-side-caption strong{color:var(--ink);font-size:15px}

.breakdown{list-style:none;padding:0;margin:0 0 14px}
.breakdown li{display:flex;align-items:center;gap:10px;padding:5px 0;font-size:14px}
.bd-label{width:84px;flex:none;color:var(--ink-soft)}
.bd-bar{flex:1;height:9px;background:var(--line-soft);border-radius:999px;overflow:hidden}
.bd-bar i{display:block;height:100%;background:var(--brand);border-radius:999px}
.bd-n{width:28px;text-align:right;color:var(--muted);font-size:13px}

.report-list{list-style:none;padding:0;margin:0}
.report{border:1px solid var(--line);border-radius:12px;padding:15px;margin-bottom:12px;background:#fcfdfd}
.report-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}
.report-time{font-size:12.5px;color:var(--muted)}
.report-facts{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:6px 18px;margin:0 0 10px}
.report-facts div{display:flex;gap:8px;font-size:13.5px}
.report-facts dt{color:var(--muted);flex:none;min-width:64px}
.report-facts dd{margin:0;color:var(--ink-soft);word-break:break-word}
.report-detail{margin:0;font-size:14px;color:var(--ink-soft);white-space:pre-wrap}
.report-evidence{margin:8px 0 0;font-size:13px;word-break:break-all}

.comment-list{list-style:none;padding:0;margin:0 0 22px}
.comment{padding:12px 0;border-bottom:1px solid var(--line-soft)}
.comment:last-child{border-bottom:0}
.comment-head{display:flex;align-items:center;gap:10px;margin-bottom:4px}
.comment-nick{font-weight:600;font-size:14px}
.comment-time{font-size:12.5px;color:var(--muted)}
.comment-body{white-space:pre-wrap;font-size:14.5px;color:var(--ink-soft)}
.comment-form{border-top:1px dashed var(--line);padding-top:18px}

/* ---------- 关于页 ---------- */
.prose{max-width:none}
.prose h2{margin-top:26px;padding-top:18px;border-top:1px solid var(--line-soft)}
.prose p,.prose li{color:var(--ink-soft)}
.prose ul{padding-left:22px}

/* ---------- 游客身份 ---------- */
.user-area{display:flex;align-items:center;gap:8px;flex:none}
.user-chip{display:flex;align-items:center;gap:7px;padding:4px 12px 4px 4px;border:1px solid var(--line);
  border-radius:999px;color:var(--ink);font-size:13.5px}
.user-chip:hover{background:var(--line-soft);text-decoration:none}
.user-avatar{width:26px;height:26px;border-radius:50%;background:var(--brand);color:#fff;display:grid;
  place-items:center;font-size:13px;font-weight:600;flex:none}
.user-name{max-width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.btn-ghost{background:transparent;font-size:13.5px;padding:7px 13px}
.inline-form{display:inline}
.link-btn{background:none;border:0;padding:0;font:inherit;font-size:13px;color:var(--brand-ink);
  cursor:pointer}
.link-btn:hover{text-decoration:underline}
.link-btn.danger{color:var(--bad)}
.own-badge{display:inline-block;font-size:11.5px;color:var(--brand-ink);background:var(--brand-soft);
  border-radius:6px;padding:1px 7px;margin-left:2px}
.owner-panel{border-color:#f2ddb5;background:#fffdf7}
.owner-panel-head{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:8px}
.owner-panel .btn-danger{margin-top:4px}
.btn-danger{background:var(--bad);border-color:var(--bad);color:#fff;font-weight:600}
.btn-danger:hover{background:#8f2117;border-color:#8f2117}

/* ---------- 情报 / 评论的操作按钮 ---------- */
.report-head-left{display:flex;align-items:center;gap:8px}
.report-head-right{display:flex;align-items:center;gap:10px}
.comment-actions{display:flex;align-items:center;gap:10px;margin-left:auto}

/* ---------- 我的贡献 ---------- */
.me-list{list-style:none;padding:0;margin:0}
.me-list li{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:10px 0;
  border-bottom:1px solid var(--line-soft)}
.me-list li:last-child{border-bottom:0}
.me-content{flex:1 1 100%;font-size:13.5px;color:var(--ink-soft);white-space:pre-wrap}
.me-actions{display:flex;align-items:center;gap:10px;margin-left:auto}

/* ---------- 登录与账号 ---------- */
.login-card{max-width:720px}
.login-grid{display:grid;grid-template-columns:1fr 1fr;gap:26px;margin-top:8px}
.login-block h2{font-size:16px;margin-bottom:2px}
.login-block .form{margin-top:12px}
.login-note{margin-top:26px;padding-top:18px;border-top:1px solid var(--line-soft)}
.login-note h2{font-size:15px;margin-bottom:8px}
.login-note p{margin:0 0 8px}
.identity-line{margin:0;font-size:14px;color:var(--ink-soft)}
.login-divider{position:relative;text-align:center;margin:20px 0 16px;border-top:1px solid var(--line-soft)}
.login-divider span{position:relative;top:-11px;background:var(--card);padding:0 10px;
  font-size:12.5px;color:var(--muted)}
.user-dot{width:7px;height:7px;border-radius:50%;background:var(--good);flex:none;margin-left:3px}
.me-title{font-weight:600}
.form-actions{display:flex;align-items:center;gap:10px}

/* ---------- 页脚 ---------- */
.site-footer{background:var(--card);border-top:1px solid var(--line);padding:24px 0;margin-top:20px}
.site-footer p{margin:0 0 8px;font-size:13px;color:var(--muted);line-height:1.7}
.footer-meta{font-size:12.5px;color:#98a1ac}
.error-detail{background:var(--line-soft);padding:12px;border-radius:10px;overflow:auto;font-size:12px;color:var(--ink-soft)}

/* ---------- 响应式：手机 / 平板 ---------- */

/* 任何一长串字符都不该撑破布局（佐证链接、没有空格的英文串等） */
.comment-body,.report-detail,.feed-desc,.me-content,.company-note,.report-evidence,
.prose,.empty-desc,.result-title,.rank-name{overflow-wrap:anywhere;word-break:break-word}

@media (max-width:760px){
  /* --- 骨架间距 --- */
  .container{padding:0 14px}
  main.container{padding:14px 14px calc(44px + env(safe-area-inset-bottom))}
  .card{padding:16px;border-radius:12px;margin-bottom:14px}
  h1{font-size:21px}
  h2{font-size:17px}
  .page-title{font-size:22px}

  /* --- 顶栏两行：品牌 + 身份在上，导航换行在下 --- */
  .header-inner{display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:9px 14px}
  .brand{flex:1 1 auto;min-width:0;gap:8px}
  .brand-mark{width:34px;height:34px;font-size:15px;border-radius:10px}
  .brand-text{min-width:0}
  .brand-text strong{font-size:16px}
  .brand-text small{display:none}
  .user-area{flex:0 0 auto}
  .user-chip{min-height:34px;padding:3px 10px 3px 3px}
  .user-name{max-width:84px}

  /* 导航独占一行，放不下就换行。
     刻意不用「横向滚动」：flex + overflow-x 的组合在部分内核/浏览器
     内置阅读模式下处理不一致，会把链接压成一个字宽、变成逐字竖排。 */
  .nav{
    flex:0 0 100%;
    display:flex;
    flex-wrap:wrap;
    gap:4px;
    margin:2px 0 0;
    padding:0;
  }
  .nav a{
    flex:0 0 auto;        /* 关键：绝不被压缩，否则就会逐字换行 */
    white-space:nowrap;
    padding:8px 11px;
    font-size:14px;
  }

  /* --- 表单 --- */
  /* 16px 是硬要求：小于它 iOS 会在聚焦时自动放大整个页面 */
  .form input[type=text],.form input[type=search],.form input[type=number],
  .form input[type=url],.form input[type=password],.form input:not([type]),
  .form textarea,.form select,.search-input{font-size:16px}
  .form label,.form legend{font-size:14.5px}
  .form-row{margin-bottom:15px}

  /* 主按钮整行，点起来不费劲 */
  .form > .btn,.form-actions .btn,.search-form .btn,.empty-actions .btn{width:100%;text-align:center}
  .form-actions{flex-direction:column;align-items:stretch;gap:8px}
  .btn{padding:12px 18px;min-height:44px;display:inline-flex;align-items:center;justify-content:center}
  .btn-ghost{min-height:34px;padding:7px 12px}
  .link-btn{padding:8px 2px;font-size:14px;display:inline-block;min-height:36px}
  .comment-actions{gap:16px}
  .me-actions{gap:16px;margin-left:0}

  /* --- 栅格全部单列 --- */
  .grid-2,.form-grid,.login-grid{grid-template-columns:1fr}
  .login-grid{gap:22px}
  .login-card{max-width:none}
  .login-block .form{margin-top:10px}
  .stats{grid-template-columns:repeat(2,1fr);gap:10px}
  .stat{padding:12px}
  .stat b{font-size:19px}
  .radio-grid{grid-template-columns:1fr}

  /* --- 首页 --- */
  .hero{padding:20px 0 6px}
  .hero h1{font-size:23px}
  .hero-sub{font-size:14.5px;margin-bottom:18px}
  .hero-hint{font-size:13px}
  .search-form{flex-direction:column}
  .empty-actions{flex-direction:column;align-items:stretch}

  /* --- 指数徽章：大号收一号，免得占满整行 --- */
  .index-badge.size-lg{width:78px;height:78px;border-radius:16px}
  .index-badge.size-lg .grade{font-size:30px}
  .index-badge.size-lg .score{font-size:12px}
  .index-badge.size-sm{width:46px;height:46px}
  .index-badge.size-sm .grade{font-size:16px}

  /* --- 厂家页 --- */
  .company-head{gap:14px}
  .company-head-main{min-width:0}
  .company-head-side{width:100%;justify-content:flex-start;gap:12px}
  .company-side-caption{font-size:13px}

  /* --- 搜索结果：徽章挪到下一行 --- */
  .result-row{flex-direction:column;align-items:stretch;gap:8px;padding:12px 0}
  .result-side{flex-direction:row;justify-content:flex-start;align-items:center;gap:10px}
  .result-verdict{max-width:none;font-size:12.5px}
  .result-title{font-size:15.5px}

  /* --- 我的贡献 --- */
  .me-list li{flex-direction:column;align-items:flex-start;gap:6px}
  .me-content{font-size:14px}

  /* --- 情报卡片 --- */
  .report{padding:13px}
  .report-head{flex-wrap:wrap;gap:8px}
  .report-head-right{margin-left:auto}
  .report-facts{grid-template-columns:1fr;gap:4px}
  .bd-label{width:72px;font-size:13.5px}

  /* --- 评论 --- */
  .comment-head{flex-wrap:wrap;gap:8px}
  .comment-body{font-size:14.5px}
  .comment-form{padding-top:14px}

  /* --- 榜单 / 动态 --- */
  .rank-row{flex-wrap:wrap;gap:4px 8px}
  .rank-name{flex:1 1 100%}
  .rank-place,.rank-n{font-size:12px}
  .feed-time{display:block;margin:2px 0 0}

  /* --- 页脚 --- */
  .site-footer{padding:18px 0}
  .site-footer p{font-size:12.5px}
}

/* 更窄的手机：再收一点 */
@media (max-width:400px){
  .brand-text strong{font-size:15px}
  .hero h1{font-size:20px}
  .page-title{font-size:20px}
  .index-badge.size-lg{width:68px;height:68px}
  .index-badge.size-lg .grade{font-size:26px}
  .report-facts div{font-size:13px}
  .comment-actions{gap:12px}
}
`

export const FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="#0f766e"/>
  <text x="32" y="44" font-size="34" font-family="system-ui,-apple-system,'PingFang SC','Microsoft YaHei',sans-serif"
        font-weight="700" fill="#ffffff" text-anchor="middle">休</text>
</svg>
`

export const ROBOTS_TXT = `User-agent: *
Allow: /
Disallow: /company/new
Disallow: /report/new
Disallow: /product/new
`

/**
 * 静态资源版本号：从样式表内容算出的简易校验和。
 * 内容一变版本号就变，浏览器会重新拉取——否则改完样式，
 * 用户在一小时内可能还在看旧的缓存版本。
 */
export const ASSET_VERSION = (() => {
  let h = 5381
  for (let i = 0; i < STYLE_CSS.length; i += 1) {
    h = ((h * 33) ^ STYLE_CSS.charCodeAt(i)) >>> 0
  }
  return h.toString(36)
})()

export const STATIC_ROUTES = {
  '/style.css': { body: STYLE_CSS, type: 'text/css; charset=utf-8' },
  '/favicon.svg': { body: FAVICON_SVG, type: 'image/svg+xml; charset=utf-8' },
  '/robots.txt': { body: ROBOTS_TXT, type: 'text/plain; charset=utf-8' },
}
