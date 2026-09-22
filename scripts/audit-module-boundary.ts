import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const sourceRoot = path.join(root, 'src')
const violations: string[] = []
const allowedSourceRoots = new Set(['api', 'domain', 'types', 'views'])

for (const entry of readdirSync(sourceRoot, { withFileTypes: true })) {
  if (entry.isDirectory() && !allowedSourceRoots.has(entry.name))
    violations.push(`不允许的公共源码目录: src/${entry.name}`)
}
for (const requiredPath of ['src/index.ts', 'src/main.ts', 'src/views']) {
  if (!existsSync(path.join(root, requiredPath)))
    violations.push(`缺少 SCM 业务入口: ${requiredPath}`)
}
function files(target: string): string[] {
  if (!existsSync(target)) return []
  if (!statSync(target).isDirectory()) return [target]
  return readdirSync(target, { withFileTypes: true }).flatMap((entry) =>
    files(path.join(target, entry.name))
  )
}
for (const file of files(sourceRoot)) {
  if (!/\.(?:ts|tsx|vue)$/.test(file)) continue
  const source = readFileSync(file, 'utf8')
  if (/@\/(?:views|api)\/(?:finance|fms|hr|mdm|mes|smis|tms|vms)(?:['"/])/.test(source)) {
    violations.push(`${path.relative(root, file)} 直接引用了其他业务仓前端源码`)
  }
}
if (violations.length) {
  console.error(['SCM 模块边界审计失败：', ...violations.map((item) => `- ${item}`)].join('\n'))
  process.exitCode = 1
} else console.log('SCM business-only boundary audit passed.')
