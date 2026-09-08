// 生成灵动岛应用图标：黑色胶囊 + 发丝描边（256×256 PNG + ICO 容器）
// 运行：node scripts/gen-icon.cjs
const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

const SIZE = 256
const SS = 4 // 4x4 超采样抗锯齿

// 像素坐标系的圆角矩形 SDF（负值在内部）
function sdfRoundRect(px, py, cx, cy, hw, hh, r) {
  const qx = Math.abs(px - cx) - (hw - r)
  const qy = Math.abs(py - cy) - (hh - r)
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r
}

// 胶囊参数
const pill = { cx: 128, cy: 132, hw: 100, hh: 46, r: 46 }
const ring = { cx: 128, cy: 132, hw: 100, hh: 46, r: 46 } // 略大的描边圈用同一形状向外扩

function coverage(px, py, sdf) {
  // 抗锯齿 alpha：sdf=0 处半透明
  return Math.max(0, Math.min(1, 0.5 - sdf))
}

const px = Buffer.alloc(SIZE * SIZE * 4) // RGBA

for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    let aBody = 0
    let aRing = 0
    for (let sy = 0; sy < SS; sy++) {
      for (let sx = 0; sx < SS; sx++) {
        const fx = x + (sx + 0.5) / SS
        const fy = y + (sy + 0.5) / SS
        aBody += coverage(fx, fy, sdfRoundRect(fx, fy, pill.cx, pill.cy, pill.hw, pill.hh, pill.r))
        // 描边环：外圈-内缩
        aRing += coverage(fx, fy, sdfRoundRect(fx, fy, ring.cx, ring.cy, ring.hw + 1.4, ring.hh + 1.4, ring.r + 1.4)) -
                 coverage(fx, fy, sdfRoundRect(fx, fy, ring.cx, ring.cy, ring.hw - 0.6, ring.hh - 0.6, ring.r - 0.6))
      }
    }
    aBody /= SS * SS
    aRing = Math.max(0, Math.min(1, aRing / (SS * SS)))

    let r = 0, g = 0, b = 0, a = 0
    // 主体纯黑（OLED 黑）
    r = 0; g = 0; b = 0; a = aBody
    // 描边：发丝白，略微增亮边缘
    const ringA = aRing * (1 - aBody) * 0.22
    r = Math.round(r + 255 * ringA)
    g = Math.round(g + 255 * ringA)
    b = Math.round(b + 255 * ringA)
    a = Math.max(a, ringA)

    const i = (y * SIZE + x) * 4
    px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = Math.round(Math.min(1, a) * 255)
  }
}

// ---- PNG 编码（RGBA8，color type 6）----
function crc32(buf) {
  let c
  const table = []
  for (let n = 0; n < 256; n++) {
    c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  let crc = 0xffffffff
  for (const byte of buf) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const typeBuf = Buffer.from(type, 'ascii')
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])))
  return Buffer.concat([len, typeBuf, data, crcBuf])
}

const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(SIZE, 0)
ihdr.writeUInt32BE(SIZE, 4)
ihdr[8] = 8 // bit depth
ihdr[9] = 6 // color type RGBA
const raw = Buffer.alloc(SIZE * (1 + SIZE * 4))
for (let y = 0; y < SIZE; y++) {
  raw[y * (1 + SIZE * 4)] = 0 // filter none
  px.copy(raw, y * (1 + SIZE * 4) + 1, y * SIZE * 4, (y + 1) * SIZE * 4)
}
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
])

// ---- ICO 容器（嵌入 256 PNG）----
const ico = Buffer.alloc(6 + 16 + png.length)
ico.writeUInt16LE(0, 0) // reserved
ico.writeUInt16LE(1, 2) // type: icon
ico.writeUInt16LE(1, 4) // count
ico[6] = 0 // width 256
ico[7] = 0 // height 256
ico[8] = 0 // colors
ico[9] = 0 // reserved
ico.writeUInt16LE(1, 10) // planes
ico.writeUInt16LE(32, 12) // bpp
ico.writeUInt32LE(png.length, 14) // size
ico.writeUInt32LE(22, 18) // offset
png.copy(ico, 22)

const outDir = path.join(__dirname, '..', 'build')
fs.mkdirSync(outDir, { recursive: true })
fs.writeFileSync(path.join(outDir, 'icon.png'), png)
fs.writeFileSync(path.join(outDir, 'icon.ico'), ico)
console.log('OK ->', path.join(outDir, 'icon.png'), png.length, 'bytes')
console.log('OK ->', path.join(outDir, 'icon.ico'), ico.length, 'bytes')
