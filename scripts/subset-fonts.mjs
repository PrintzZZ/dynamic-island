// 把苹方六个字重各子集化成"常用字"版本，显著降低渲染进程的内存占用。
//
// 背景：每个完整 CJK 字重（42199 字形）实测在渲染进程里占 **10.9MB**；UI 里常用的
// 只有 500 / 600 两档（400 用于紧凑态时间，200 / 300 只在网速与倒计时里），
// 最坏情况会同时驻留 4~5 份，也就是 40~50MB。子集到 3755 个常用字 + 标点 + Latin
// 之后，每份只剩 1MB 出头。
//
// 字形集合 = GB2312 一级汉字（3755 个常用字，按 GBK 字节区间枚举）
//          ∪ ASCII 与常用标点
//          ∪ 本仓库 src/ 里实际出现过的所有字符（保证 UI 文案 100% 覆盖）
//
// 罕用字（用户自己打的生僻字、便签/待办里的任意汉字）会自然回落到字体栈里的
// MiSans —— 它是完整字重，不参与子集化。这条回退链本来就在设计里（苹方缺失时
// 就是回落到 MiSans），所以不会出现"缺字显示成方块"。
//
// 用法：npm run fonts:subset
// 依赖：subset-font（devDependency，内置 harfbuzz-wasm，不需要 Python）
//
// ⚠️ 产物在 src/assets/fonts/subset/，和完整字体一样**不进仓库**（苹方是 Apple
// 专有字体，再分发侵权）。新克隆的仓库没跑过这个脚本也没关系：fonts.css 里
// 引用不到文件就自动回落到 MiSans / 系统字体，和现在"没放字体文件"的行为一致。

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import subsetFont from 'subset-font'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SRC_DIR = path.join(ROOT, 'src', 'assets', 'fonts')
const OUT_DIR = path.join(SRC_DIR, 'subset')

// GB2312 一级汉字：区位 16-55 区，字节区间 0xB0A1 - 0xD7F9
function gb2312Level1() {
  const dec = new TextDecoder('gbk')
  let s = ''
  for (let hi = 0xb0; hi <= 0xd7; hi++) {
    for (let lo = 0xa1; lo <= 0xfe; lo++) {
      if (hi === 0xd7 && lo > 0xf9) break
      const ch = dec.decode(new Uint8Array([hi, lo]))
      if (ch && ch !== '\uFFFD') s += ch
    }
  }
  return s
}

function asciiAndPunct() {
  let s = ''
  for (let c = 0x20; c < 0x7f; c++) s += String.fromCharCode(c)
  s += '　·—–…“”‘’《》〈〉【】（）「」『』、。，．！？：；×÷±°%＆&@#*+-=/\\|<>[]{}'
  s += '①②③④⑤⑥⑦⑧⑨⑩←→↑↓↔✓✕×√'
  return s
}

// 扫 src/ 里出现的所有字符，保证 UI 文案一定被覆盖
function repoChars() {
  let s = ''
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) walk(p)
      else if (/\.(vue|js|css|html|json)$/.test(e.name)) s += fs.readFileSync(p, 'utf8')
    }
  }
  walk(path.join(ROOT, 'src'))
  return s
}

const chars = new Set((gb2312Level1() + asciiAndPunct() + repoChars()).split(''))
chars.delete('\n')
chars.delete('\r')
const text = Array.from(chars).join('')

console.log(`字符集大小: ${chars.size} 个字符`)
console.log(`输出目录:   ${path.relative(ROOT, OUT_DIR)}`)

if (!fs.existsSync(SRC_DIR)) {
  console.log('没有 src/assets/fonts 目录，跳过。')
  process.exit(0)
}

const files = fs.readdirSync(SRC_DIR).filter((f) => f.endsWith('.woff2'))
if (!files.length) {
  console.log('没有 .woff2 源文件（完整字体没放进来），跳过。')
  process.exit(0)
}

fs.mkdirSync(OUT_DIR, { recursive: true })

let saved = 0
for (const f of files) {
  // MiSans 保持完整：它是罕用字的回退，本身就要求覆盖全
  if (/^MiSans/i.test(f)) {
    console.log(`  ${f.padEnd(30)} 跳过（回退字体，保持完整）`)
    continue
  }
  // Inter 也保持完整：它是西文/数字，子集会把变音符、希腊字母之类的裁掉，
  // 而歌名 / 文件名里这些字符很常见，省下的 0.26MB 完全不值。
  if (/^Inter/i.test(f)) {
    console.log(`  ${f.padEnd(30)} 跳过（西文，保持完整）`)
    continue
  }
  const src = path.join(SRC_DIR, f)
  const buf = fs.readFileSync(src)
  try {
    const out = await subsetFont(buf, text, { targetFormat: 'woff2' })
    const dst = path.join(OUT_DIR, f)
    fs.writeFileSync(dst, out)
    saved += buf.length - out.length
    console.log(
      `  ${f.padEnd(30)} ${(buf.length / 1048576).toFixed(2)}MB → ${(out.length / 1048576).toFixed(2)}MB`
    )
  } catch (e) {
    console.error(`  ${f.padEnd(30)} 子集化失败: ${e && e.message}`)
  }
}
console.log(`共减小 ${(saved / 1048576).toFixed(1)}MB（磁盘）；内存收益约为此数的 2 倍`)
console.log('提示：fonts.css 已指向 subset/ 目录，重新加载应用即可生效。')
