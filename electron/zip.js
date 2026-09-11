// 零依赖的流式 ZIP 打包器
//
// 设计目标（见「材料箱」需求第十三、二十节）：
//   · 全程  文件流 → deflate → 磁盘，绝不把整个文件读进内存
//   · 支持进度回调与取消
//   · 不依赖任何第三方包（避免 electron-builder 打包时的 node_modules 依赖树问题）
//
// 实现要点：每个文件用「数据描述符」模式（general purpose flag bit 3），
// 即本地文件头里的 crc / 尺寸先写 0，压缩完再补一段 data descriptor，
// 这样就能一边读、一边压、一边写，既不用为了拿 CRC 读两遍文件，也不用缓存到内存。
// 中央目录里写的是真实尺寸，所以 Windows 资源管理器 / Expand-Archive / 7-Zip 都能正常解开。

import fs from 'node:fs'
import zlib from 'node:zlib'
import { once } from 'node:events'

// ---------- CRC32 ----------
const CRC_TABLE = (() => {
  const t = new Int32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[i] = c
  }
  return t
})()

function makeCrc() {
  let c = 0xffffffff
  return {
    update(buf) {
      for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
    },
    digest() {
      return (c ^ 0xffffffff) >>> 0
    },
  }
}

// ---------- 小工具 ----------
// DOS 时间格式（ZIP 用）：日期从 1980 年起算，秒只有 2 秒精度
function dosDateTime(d = new Date()) {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()
  return { time: time & 0xffff, date: date & 0xffff }
}

// 归档内文件名：统一用 / 分隔，去掉盘符与 .. ，避免绝对路径 / 路径穿越
function toEntryName(name) {
  return (
    String(name || 'file')
      .replace(/\\/g, '/')
      .replace(/^[a-zA-Z]:/, '')
      .replace(/^\/+/, '')
      .replace(/\.\.(\/|$)/g, '') || 'file'
  )
}

// 带字节计数的写出：offset 全程精确，中央目录不用手算偏移
async function write(ctx, buf) {
  ctx.written += buf.length
  if (!ctx.out.write(buf)) await once(ctx.out, 'drain')
}

// ---------- 单个文件 ----------
async function addFile(ctx, file, onBytes, isCancelled) {
  const entryName = toEntryName(file.entryName || file.name)
  const nameBuf = Buffer.from(entryName, 'utf8')
  const { time, date } = dosDateTime(file.mtime ? new Date(file.mtime) : new Date())
  const headerOffset = ctx.written

  // 本地文件头：flag = 0x0808（bit3 数据描述符 + bit11 UTF-8 文件名）
  const lfh = Buffer.alloc(30)
  lfh.writeUInt32LE(0x04034b50, 0)
  lfh.writeUInt16LE(20, 4) // version needed
  lfh.writeUInt16LE(0x0808, 6) // flags
  lfh.writeUInt16LE(8, 8) // deflate
  lfh.writeUInt16LE(time, 10)
  lfh.writeUInt16LE(date, 12)
  lfh.writeUInt32LE(0, 14) // crc（占位，走数据描述符）
  lfh.writeUInt32LE(0, 18) // compressed size（占位）
  lfh.writeUInt32LE(0, 22) // uncompressed size（占位）
  lfh.writeUInt16LE(nameBuf.length, 26)
  lfh.writeUInt16LE(0, 28) // extra length
  await write(ctx, lfh)
  await write(ctx, nameBuf)

  const crc = makeCrc()
  let uncompressed = 0
  let compressed = 0

  const rs = fs.createReadStream(file.absPath)
  const deflate = zlib.createDeflateRaw({ level: zlib.constants.Z_DEFAULT_COMPRESSION })

  let sourceError = null
  rs.on('error', (err) => {
    sourceError = err
    deflate.destroy()
  })
  rs.on('data', (chunk) => {
    uncompressed += chunk.length
    crc.update(chunk)
    onBytes(chunk.length)
  })
  rs.pipe(deflate)

  for await (const chunk of deflate) {
    if (isCancelled()) {
      rs.destroy()
      deflate.destroy()
      const err = new Error('cancelled')
      err.code = 'CANCELLED'
      throw err
    }
    compressed += chunk.length
    await write(ctx, chunk)
  }
  if (sourceError) throw sourceError

  const crcVal = crc.digest()

  // 数据描述符（带签名 0x08074b50，兼容性最好）
  const dd = Buffer.alloc(16)
  dd.writeUInt32LE(0x08074b50, 0)
  dd.writeUInt32LE(crcVal, 4)
  dd.writeUInt32LE(compressed, 8)
  dd.writeUInt32LE(uncompressed, 12)
  await write(ctx, dd)

  return { entryName, nameBuf, crcVal, compressed, uncompressed, time, date, headerOffset }
}

// ---------- 打包入口 ----------
/**
 * @param {object} opts
 * @param {{absPath:string,name:string,entryName?:string,mtime?:number,size?:number}[]} opts.files
 * @param {string} opts.outPath
 * @param {(p:{bytes:number,totalBytes:number,doneFiles:number,totalFiles:number,current:string})=>void} [opts.onProgress]
 * @param {() => boolean} [opts.isCancelled]
 */
async function createZip({ files, outPath, onProgress, isCancelled = () => false }) {
  const totalBytes = files.reduce((s, f) => s + (f.size || 0), 0)
  const ctx = { out: fs.createWriteStream(outPath), written: 0 }
  const entries = []
  let bytes = 0
  let doneFiles = 0
  let lastEmit = 0

  const report = (current, force = false) => {
    const now = Date.now()
    if (!force && now - lastEmit < 80) return // 节流：别把 IPC 刷爆
    lastEmit = now
    onProgress?.({ bytes, totalBytes, doneFiles, totalFiles: files.length, current })
  }

  try {
    for (const f of files) {
      if (isCancelled()) {
        const err = new Error('cancelled')
        err.code = 'CANCELLED'
        throw err
      }
      const entry = await addFile(
        ctx,
        f,
        (n) => {
          bytes += n
          report(f.name)
        },
        isCancelled
      )
      entries.push(entry)
      doneFiles++
      report(f.name, true)
    }

    // ---------- 中央目录 ----------
    const cdStart = ctx.written
    for (const e of entries) {
      const cdh = Buffer.alloc(46)
      cdh.writeUInt32LE(0x02014b50, 0)
      cdh.writeUInt16LE(20, 4) // version made by
      cdh.writeUInt16LE(20, 6) // version needed
      cdh.writeUInt16LE(0x0808, 8) // flags
      cdh.writeUInt16LE(8, 10) // deflate
      cdh.writeUInt16LE(e.time, 12)
      cdh.writeUInt16LE(e.date, 14)
      cdh.writeUInt32LE(e.crcVal, 16)
      cdh.writeUInt32LE(e.compressed, 20)
      cdh.writeUInt32LE(e.uncompressed, 24)
      cdh.writeUInt16LE(e.nameBuf.length, 28)
      cdh.writeUInt16LE(0, 30) // extra
      cdh.writeUInt16LE(0, 32) // comment
      cdh.writeUInt16LE(0, 34) // disk start
      cdh.writeUInt16LE(0, 36) // internal attrs
      cdh.writeUInt32LE(0, 38) // external attrs
      cdh.writeUInt32LE(e.headerOffset, 42)
      await write(ctx, cdh)
      await write(ctx, e.nameBuf)
    }
    const cdSize = ctx.written - cdStart

    // ---------- 中央目录结束记录 ----------
    const eocd = Buffer.alloc(22)
    eocd.writeUInt32LE(0x06054b50, 0)
    eocd.writeUInt16LE(0, 4) // disk number
    eocd.writeUInt16LE(0, 6) // disk with CD
    eocd.writeUInt16LE(entries.length, 8)
    eocd.writeUInt16LE(entries.length, 10)
    eocd.writeUInt32LE(cdSize, 12)
    eocd.writeUInt32LE(cdStart, 16)
    eocd.writeUInt16LE(0, 20) // comment length
    await write(ctx, eocd)

    await new Promise((resolve, reject) => {
      ctx.out.on('error', reject)
      ctx.out.end(resolve)
    })

    return {
      outPath,
      fileCount: entries.length,
      totalBytes,
      zipBytes: fs.statSync(outPath).size,
    }
  } catch (err) {
    ctx.out.destroy()
    // 失败 / 取消：不留半个 ZIP
    try {
      fs.unlinkSync(outPath)
    } catch {
      /* ignore */
    }
    throw err
  }
}

export { createZip, makeCrc, toEntryName }
