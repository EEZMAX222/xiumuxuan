/**
 * 测试运行器：在**独立的数据库**上跑全部测试，绝不碰你的正式数据。
 *
 *   npm test
 *
 * 流程：起一个用 data/test-run.db 的服务器（端口 8788）→ 跑两个测试套件
 *      → 关掉服务器 → 删掉测试库。
 *
 * 之所以要这样：早先的测试直接打在正式库上，跑一次就污染一次数据，
 * 结果只能靠「测完删库重来」收场——那正是数据被反复清零的原因。
 */
import { spawn } from 'node:child_process'
import { rm } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')

const PORT = Number(process.env.TEST_PORT || 8788)
const BASE = `http://127.0.0.1:${PORT}`
const TEST_DB = resolve(root, process.env.TEST_DB || 'data/test-run.db')

const SUITES = [
  { name: '主流程', file: 'scripts/smoke-test.js' },
  // 放在「身份与权限」之前：后者开头会清空限流记录，
  // 移动端这套自己会注册一个账号，先跑就不会撞上注册限流
  { name: '移动端适配', file: 'scripts/mobile-test.js' },
  { name: '身份与权限', file: 'scripts/auth-test.js' },
]

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** 等服务器起来（最多 20 秒） */
async function waitForServer() {
  for (let i = 0; i < 40; i += 1) {
    try {
      const res = await fetch(`${BASE}/healthz`)
      if (res.ok) return true
    } catch { /* 还没起来 */ }
    await sleep(500)
  }
  return false
}

function runSuite({ name, file }) {
  return new Promise((resolvePromise) => {
    console.log(`\n${'='.repeat(56)}`)
    console.log(`  ${name}  (${file})`)
    console.log('='.repeat(56))
    const child = spawn(process.execPath, [resolve(root, file)], {
      cwd: root,
      env: { ...process.env, BASE, DB_PATH: TEST_DB },
      stdio: 'inherit',
    })
    child.on('exit', (code) => resolvePromise(code === 0))
    child.on('error', () => resolvePromise(false))
  })
}

async function main() {
  console.log('休沐选 · 测试（使用独立数据库，不会改动正式数据）')
  console.log(`  测试库：${TEST_DB}`)
  console.log(`  端口：  ${PORT}`)

  await rm(TEST_DB, { force: true })
  await rm(`${TEST_DB}-wal`, { force: true })
  await rm(`${TEST_DB}-shm`, { force: true })

  const server = spawn(process.execPath, [resolve(root, 'src/server.js')], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(PORT),
      DB_PATH: TEST_DB,
      GEO_DEBUG: '1',
      NODE_ENV: 'test',
    },
    // 沙箱禁止管道捕获子进程输出，这里用 ignore；需要看服务器日志时
    // 手动运行：DB_PATH=./data/test-run.db PORT=8788 node src/server.js
    stdio: 'ignore',
  })

  let serverExited = false
  server.on('exit', () => { serverExited = true })

  const results = []
  try {
    const ready = await waitForServer()
    if (!ready || serverExited) {
      console.error('\n测试服务器未能启动。请手动运行下面这条命令查看原因：')
      console.error(`  DB_PATH=./data/test-run.db PORT=${PORT} node src/server.js`)
      process.exitCode = 1
      return
    }
    console.log('  服务器就绪\n')

    for (const suite of SUITES) {
      results.push({ name: suite.name, ok: await runSuite(suite) })
    }
  } finally {
    try { server.kill() } catch { /* ignore */ }
    await sleep(500)
    for (const f of [TEST_DB, `${TEST_DB}-wal`, `${TEST_DB}-shm`]) {
      await rm(f, { force: true }).catch(() => {})
    }
  }

  console.log(`\n${'='.repeat(56)}`)
  console.log('  测试汇总')
  console.log('='.repeat(56))
  for (const r of results) {
    console.log(`  ${r.ok ? '✓ 通过' : '✗ 失败'}   ${r.name}`)
  }
  const failed = results.filter((r) => !r.ok).length
  console.log(`\n  ${results.length - failed}/${results.length} 个套件通过`)
  console.log('  测试数据库已删除，正式数据未被触碰\n')

  process.exitCode = failed ? 1 : 0
}

main().catch((err) => {
  console.error('测试运行器出错：', err)
  process.exitCode = 1
})
