/**
 * 规则集导出 / 导入共用工具：定位数据库、远程下载上传、备份与重启服务。
 */
import { existsSync, mkdirSync, copyFileSync, rmSync, mkdtempSync } from 'node:fs'
import { join, dirname, resolve, basename } from 'node:path'
import { tmpdir } from 'node:os'
import { DatabaseSync } from 'node:sqlite'
import { execFileSync } from 'node:child_process'

const DB_NAME = 'reports.db'

/** 解析 `host` 或 `host:/path/reports.db`；不传表示本地 */
export function parseTarget(arg) {
  if (!arg || arg.startsWith('-')) return { remote: false }
  const [host, dbPath] = arg.includes(':') ? arg.split(':') : [arg, '']
  if (!host) return { remote: false }
  return { remote: true, host, dbPath: dbPath || '' }
}

export function dataDir(root) {
  return process.env.WEBREPORT_DATA_DIR ?? join(root, 'web-report-data')
}

export function localDbFile(root) {
  return resolve(join(dataDir(root), DB_NAME))
}

export function openDb(file, readonly = false) {
  const db = new DatabaseSync(file, { readOnly: readonly })
  db.exec('PRAGMA busy_timeout = 10000;')
  return db
}

/** 合并 WAL，保证读到的是完整快照 */
export function checkpoint(file) {
  const db = new DatabaseSync(file)
  try {
    db.exec('PRAGMA wal_checkpoint(TRUNCATE);')
  } finally {
    db.close()
  }
}

/** 写库前备份到同目录 backups/ */
export function backup(file) {
  checkpoint(file)
  const dir = join(dirname(file), 'backups')
  mkdirSync(dir, { recursive: true })
  const target = join(dir, `rulesets-${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)}.db`)
  copyFileSync(file, target)
  return target
}

const quote = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`

function run(cmd, args) {
  try {
    return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['inherit', 'pipe', 'inherit'] })
  } catch (err) {
    if (err.code === 'ENOENT') throw new Error('未找到 ssh/scp，请先安装 OpenSSH 客户端')
    throw err
  }
}

export function ssh(host, command) {
  return run('ssh', [host, command])
}

/** 服务器上定位 reports.db：先查常见部署目录，找不到再搜 */
export function findRemoteDb(host) {
  const out = ssh(
    host,
    `(ls /opt/*/web-report-data/${DB_NAME} /srv/*/web-report-data/${DB_NAME} /var/www/*/web-report-data/${DB_NAME} /root/web-report-data/${DB_NAME} /home/*/web-report-data/${DB_NAME} 2>/dev/null; ` +
      `find /opt /srv /var/www /home /root -maxdepth 5 -name ${DB_NAME} -not -path '*/node_modules/*' 2>/dev/null) | sort -u`
  )
  const found = out.split('\n').map((s) => s.trim()).filter(Boolean)
  if (found.length === 0) throw new Error('服务器上没找到 reports.db，请用 host:/path/reports.db 指定')
  if (found.length > 1) throw new Error('找到多个 reports.db，请用 host:/path/reports.db 指定：\n  ' + found.join('\n  '))
  return found[0]
}

/** 下载数据库（含 WAL/SHM）到临时目录 */
export function downloadDb(host, remotePath) {
  const dir = mkdtempSync(join(tmpdir(), 'wr-rulesets-'))
  const file = join(dir, basename(remotePath))
  let ok = false
  for (const suffix of ['', '-wal', '-shm']) {
    try {
      run('scp', ['-q', `${host}:${remotePath}${suffix}`, file + suffix])
      if (!suffix) ok = true
    } catch {
      // WAL / SHM 可能不存在
    }
  }
  if (!ok || !existsSync(file)) throw new Error(`下载失败：${host}:${remotePath}`)
  checkpoint(file)
  return { dir, file }
}

/** 上传数据库并删除旧 WAL/SHM，避免残留事务日志 */
export function uploadDb(host, remotePath, localFile) {
  const tmp = `${remotePath}.upload-${Date.now()}`
  run('scp', ['-q', localFile, `${host}:${tmp}`])
  ssh(host, `mv -f ${quote(tmp)} ${quote(remotePath)} && rm -f ${quote(remotePath + '-wal')} ${quote(remotePath + '-shm')}`)
}

/** 重启 web-report 服务；未匹配到时返回空数组 */
export function restartWebReport(host) {
  const out = ssh(
    host,
    `systemctl list-units --type=service --state=running --no-legend --plain 2>/dev/null | awk '{print $1}' | grep -iE 'web.?report|website.?report' || true`
  )
  const services = out.split('\n').map((s) => s.trim()).filter(Boolean)
  for (const svc of services) ssh(host, `systemctl restart ${quote(svc)}`)
  return services
}

export function cleanup(dir) {
  if (dir) rmSync(dir, { recursive: true, force: true })
}

/** 文件名时间戳：20261120-173001 */
export function stamp() {
  const s = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${s.getFullYear()}${p(s.getMonth() + 1)}${p(s.getDate())}-${p(s.getHours())}${p(s.getMinutes())}${p(s.getSeconds())}`
}
