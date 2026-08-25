import { execFile, spawn } from 'node:child_process'
import { access } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import type { IncomingMessage, ServerResponse } from 'node:http'

export const name = 'dsh-kdocs-browser'
export const inject = ['webServer']

const execFileAsync = promisify(execFile)

type JsonMap = Record<string, unknown>

function writeJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(JSON.stringify(body))
}

async function readJson(req: IncomingMessage): Promise<JsonMap> {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  if (chunks.length === 0) return {}
  const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
}

async function hasKdocsSkill(): Promise<boolean> {
  const candidates = [
    join(homedir(), '.dsh', 'skills', 'kdocs', 'SKILL.md'),
    join(homedir(), '.cursor', 'skills', 'kdocs', 'SKILL.md'),
  ]
  for (const path of candidates) {
    try {
      await access(path)
      return true
    } catch {
      /* try next */
    }
  }
  return false
}

async function resolveCli(): Promise<string | null> {
  const candidates = [
    process.env.KDOCS_CLI,
    join(homedir(), '.local/bin/kdocs-cli'),
    '/usr/local/bin/kdocs-cli',
    join(homedir(), 'bin/kdocs-cli'),
  ].filter((value): value is string => Boolean(value))
  for (const path of candidates) {
    try {
      await access(path)
      return path
    } catch {
      /* try next */
    }
  }
  return null
}

function deepestData(payload: unknown): JsonMap {
  let current: unknown = payload
  for (let i = 0; i < 4; i += 1) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) break
    const record = current as JsonMap
    const inner = record.data
    if (!inner || typeof inner !== 'object' || Array.isArray(inner)) {
      return record
    }
    const nested = inner as JsonMap
    if ('items' in nested || 'status' in nested || 'content' in nested || 'file' in nested) {
      return nested
    }
    current = nested
  }
  return current && typeof current === 'object' && !Array.isArray(current)
    ? (current as JsonMap)
    : {}
}

function cliError(payload: JsonMap, stderr: string): string | null {
  const code = payload.code
  if (typeof code === 'number' && code !== 0) {
    const msg = payload.msg ?? payload.message ?? stderr
    return typeof msg === 'string' && msg ? msg : `kdocs-cli code ${code}`
  }
  return null
}

async function kdocs(args: string[], timeoutMs = 60000): Promise<JsonMap> {
  const bin = await resolveCli()
  if (!bin) {
    throw new Error('未找到 kdocs-cli，请先安装金山文档 CLI')
  }
  const { stdout, stderr } = await execFileAsync(bin, args, {
    timeout: timeoutMs,
    maxBuffer: 8 * 1024 * 1024,
    env: { ...process.env, PATH: `${join(homedir(), '.local/bin')}:${process.env.PATH || ''}` },
  })
  let payload: JsonMap = {}
  try {
    payload = JSON.parse(stdout) as JsonMap
  } catch {
    throw new Error(stderr.trim() || stdout.trim() || 'kdocs-cli 返回非 JSON')
  }
  const err = cliError(payload, stderr)
  if (err) throw new Error(err)
  return payload
}

function asItems(data: JsonMap): unknown[] {
  const items = data.items
  if (!Array.isArray(items)) return []
  return items.map((item) => {
    if (item && typeof item === 'object' && !Array.isArray(item) && 'file' in item) {
      const wrapped = item as JsonMap
      const file = wrapped.file
      return file && typeof file === 'object' ? file : item
    }
    return item
  })
}

function asRecord(item: unknown): JsonMap | null {
  return item && typeof item === 'object' && !Array.isArray(item) ? (item as JsonMap) : null
}

function isFolderRecord(item: JsonMap): boolean {
  const type = String(item.type || '').toLowerCase()
  return type === 'folder' || type === 'dir'
}

function itemId(item: JsonMap): string {
  const id = item.id
  return typeof id === 'string' ? id : ''
}

function itemName(item: JsonMap): string {
  const name = item.name
  return typeof name === 'string' && name ? name : '未命名文件夹'
}

async function listAllChildren(driveId: string, parentId: string): Promise<JsonMap[]> {
  const out: JsonMap[] = []
  let pageToken = ''
  for (let page = 0; page < 40; page += 1) {
    const payload: JsonMap = { parent_id: parentId, page_size: 50, drive_id: driveId }
    if (pageToken) payload.page_token = pageToken
    const raw = await kdocs(['drive', 'list-files', JSON.stringify(payload), '--compact'])
    const data = deepestData(raw)
    for (const item of asItems(data)) {
      const record = asRecord(item)
      if (record) out.push(record)
    }
    const next = typeof data.next_page_token === 'string' ? data.next_page_token : ''
    if (!next) break
    pageToken = next
  }
  return out
}

async function moveFiles(driveId: string, fileIds: string[], dstDriveId: string, dstParentId: string): Promise<void> {
  for (let i = 0; i < fileIds.length; i += 20) {
    const chunk = fileIds.slice(i, i + 20)
    if (chunk.length === 0) continue
    await kdocs(
      [
        'drive',
        'move-file',
        JSON.stringify({
          drive_id: driveId,
          file_ids: chunk,
          dst_drive_id: dstDriveId,
          dst_parent_id: dstParentId,
        }),
        '--compact',
      ],
      120000,
    )
  }
}

async function recreateAndMoveFolder(
  source: JsonMap,
  dstDriveId: string,
  dstParentId: string,
): Promise<{ id: string }> {
  const sourceId = itemId(source)
  const driveId = typeof source.drive_id === 'string' && source.drive_id ? source.drive_id : dstDriveId
  if (!sourceId) throw new Error('文件夹缺少 id')
  if (sourceId === dstParentId) throw new Error('不能把文件夹移进自己')
  const createdRaw = await kdocs(
    [
      'drive',
      'create-folder',
      JSON.stringify({
        drive_id: dstDriveId,
        parent_id: dstParentId,
        name: itemName(source),
        on_name_conflict: 'rename',
      }),
      '--compact',
    ],
  )
  const created = deepestData(createdRaw)
  const newId = itemId(created)
  if (!newId) throw new Error('重建文件夹失败')
  const children = await listAllChildren(driveId, sourceId)
  const fileIds = children.filter((item) => !isFolderRecord(item)).map(itemId).filter(Boolean)
  await moveFiles(driveId, fileIds, dstDriveId, newId)
  for (const child of children.filter(isFolderRecord)) {
    await recreateAndMoveFolder(child, dstDriveId, newId)
  }
  return { id: newId }
}

export function apply(ctx: {
  effect: (fn: () => unknown) => void
  webServer: { register: (route: unknown) => unknown }
}): void {
  ctx.effect(() =>
    ctx.webServer.register({
      kind: 'prefix',
      path: '/clouddoc',
      handler: async (req: IncomingMessage, res: ServerResponse) => {
        try {
          const url = new URL(req.url ?? '/', 'http://dsh.internal')
          const pathname = url.pathname.replace(/\/+$/, '') || '/'

          if (req.method === 'GET' && pathname === '/clouddoc/status') {
            const skill = await hasKdocsSkill()
            const bin = await resolveCli()
            if (!bin) {
              writeJson(res, 200, { cli: false, authenticated: false, skill })
              return
            }
            try {
              const payload = await kdocs(['auth', 'status', '--compact'])
              writeJson(res, 200, {
                cli: true,
                authenticated: Boolean(payload.authenticated),
                skill,
              })
            } catch (error) {
              writeJson(res, 200, {
                cli: true,
                authenticated: false,
                skill,
                error: error instanceof Error ? error.message : String(error),
              })
            }
            return
          }

          if (req.method === 'POST' && pathname === '/clouddoc/login') {
            const bin = await resolveCli()
            if (!bin) {
              writeJson(res, 400, { error: '未找到 kdocs-cli' })
              return
            }
            const child = spawn(bin, ['auth', 'login'], {
              env: { ...process.env, PATH: `${join(homedir(), '.local/bin')}:${process.env.PATH || ''}` },
              detached: true,
              stdio: 'ignore',
            })
            child.unref()
            writeJson(res, 200, {
              ok: true,
              hint: '已启动 kdocs-cli auth login，请在弹出的浏览器里完成授权，然后点刷新。',
            })
            return
          }

          if (req.method === 'GET' && pathname === '/clouddoc/root') {
            const pageSize = Number(url.searchParams.get('page_size') || '50')
            const pageToken = url.searchParams.get('page_token') || undefined
            const payload: JsonMap = { page_size: pageSize, order: 'desc', order_by: 'mtime' }
            if (pageToken) payload.page_token = pageToken
            const raw = await kdocs(['drive', 'list-my-files', JSON.stringify(payload), '--compact'])
            const data = deepestData(raw)
            writeJson(res, 200, {
              drive_id: data.drive_id,
              parent_id: data.parent_id ?? '0',
              next_page_token: data.next_page_token ?? '',
              items: asItems(data),
            })
            return
          }

          if (req.method === 'GET' && pathname === '/clouddoc/files') {
            const driveId = url.searchParams.get('drive_id') || ''
            const parentId = url.searchParams.get('parent_id') || ''
            if (!parentId) {
              writeJson(res, 400, { error: 'parent_id 必填' })
              return
            }
            const payload: JsonMap = {
              parent_id: parentId,
              page_size: Number(url.searchParams.get('page_size') || '50'),
            }
            if (driveId) payload.drive_id = driveId
            const pageToken = url.searchParams.get('page_token')
            if (pageToken) payload.page_token = pageToken
            const raw = await kdocs(['drive', 'list-files', JSON.stringify(payload), '--compact'])
            const data = deepestData(raw)
            writeJson(res, 200, {
              next_page_token: data.next_page_token ?? '',
              items: asItems(data),
            })
            return
          }

          if (req.method === 'POST' && pathname === '/clouddoc/move') {
            const body = await readJson(req)
            const fileId = typeof body.file_id === 'string' ? body.file_id : ''
            const driveId = typeof body.drive_id === 'string' ? body.drive_id : ''
            const dstDriveId =
              typeof body.dst_drive_id === 'string' && body.dst_drive_id ? body.dst_drive_id : driveId
            const dstParentId = typeof body.dst_parent_id === 'string' ? body.dst_parent_id : ''
            const type = typeof body.type === 'string' ? body.type : ''
            if (!fileId || !driveId || dstParentId === '') {
              writeJson(res, 400, { error: 'file_id、drive_id、dst_parent_id 必填' })
              return
            }
            if (type === 'folder' || type === 'dir') {
              const result = await recreateAndMoveFolder(
                {
                  id: fileId,
                  drive_id: driveId,
                  name: typeof body.name === 'string' ? body.name : '未命名文件夹',
                  type: 'folder',
                },
                dstDriveId,
                dstParentId,
              )
              writeJson(res, 200, {
                ok: true,
                id: result.id,
                warning: '云盘接口不能直接移动文件夹，已在目标处重建同名文件夹并移入内部文件。原位置可能留下空文件夹，可在网页里删除。',
              })
              return
            }
            const raw = await kdocs(
              [
                'drive',
                'move-file',
                JSON.stringify({
                  drive_id: driveId,
                  file_ids: [fileId],
                  dst_drive_id: dstDriveId,
                  dst_parent_id: dstParentId,
                }),
                '--compact',
              ],
            )
            writeJson(res, 200, deepestData(raw))
            return
          }

          if (req.method === 'POST' && pathname === '/clouddoc/rename') {
            const body = await readJson(req)
            const fileId = typeof body.file_id === 'string' ? body.file_id : ''
            const dstName = typeof body.dst_name === 'string' ? body.dst_name.trim() : ''
            if (!fileId || !dstName) {
              writeJson(res, 400, { error: 'file_id 与 dst_name 必填' })
              return
            }
            const payload: JsonMap = { file_id: fileId, dst_name: dstName }
            if (typeof body.drive_id === 'string' && body.drive_id) payload.drive_id = body.drive_id
            const raw = await kdocs(['drive', 'rename-file', JSON.stringify(payload), '--compact'])
            writeJson(res, 200, deepestData(raw))
            return
          }

          if (req.method === 'POST' && pathname === '/clouddoc/mkdir') {
            const body = await readJson(req)
            const driveId = typeof body.drive_id === 'string' ? body.drive_id : ''
            const parentId = typeof body.parent_id === 'string' && body.parent_id ? body.parent_id : '0'
            const name = typeof body.name === 'string' ? body.name.trim() : ''
            if (!driveId || !name) {
              writeJson(res, 400, { error: 'drive_id 与 name 必填' })
              return
            }
            const raw = await kdocs(
              [
                'drive',
                'create-folder',
                JSON.stringify({
                  drive_id: driveId,
                  parent_id: parentId,
                  name,
                  on_name_conflict: 'rename',
                }),
                '--compact',
              ],
            )
            writeJson(res, 200, deepestData(raw))
            return
          }

          if (req.method === 'POST' && pathname === '/clouddoc/create-otl') {
            const body = await readJson(req)
            const driveId = typeof body.drive_id === 'string' ? body.drive_id : ''
            const parentId = typeof body.parent_id === 'string' && body.parent_id ? body.parent_id : '0'
            let name = typeof body.name === 'string' ? body.name.trim() : ''
            if (!driveId || !name) {
              writeJson(res, 400, { error: 'drive_id 与 name 必填' })
              return
            }
            if (!name.toLowerCase().endsWith('.otl')) name = `${name}.otl`
            const raw = await kdocs(
              [
                'drive',
                'create-empty-file',
                JSON.stringify({
                  drive_id: driveId,
                  parent_id: parentId,
                  name,
                  file_extension: 'otl',
                  on_name_conflict: 'rename',
                }),
                '--compact',
              ],
            )
            writeJson(res, 200, deepestData(raw))
            return
          }

          if (req.method === 'POST' && pathname === '/clouddoc/save-otl') {
            const body = await readJson(req)
            const fileId = typeof body.file_id === 'string' ? body.file_id : ''
            const content = typeof body.content === 'string' ? body.content : ''
            const title = typeof body.title === 'string' ? body.title.trim() : ''
            if (!fileId) {
              writeJson(res, 400, { error: 'file_id 必填' })
              return
            }
            const payload: JsonMap = {
              file_id: fileId,
              content,
              format: 'markdown',
              mode: 'replace',
            }
            if (title) payload.title = title
            const raw = await kdocs(['otl', 'insert-content', JSON.stringify(payload), '--compact'], 120000)
            writeJson(res, 200, deepestData(raw))
            return
          }

          if (req.method === 'POST' && pathname === '/clouddoc/read') {
            const body = await readJson(req)
            const fileId = typeof body.file_id === 'string' ? body.file_id : ''
            const linkUrl = typeof body.link_url === 'string' ? body.link_url : ''
            const taskId = typeof body.task_id === 'string' ? body.task_id : ''
            if (!fileId && !linkUrl) {
              writeJson(res, 400, { error: 'file_id 或 link_url 必填' })
              return
            }
            const payload: JsonMap = {}
            if (fileId) payload.file_id = fileId
            else payload.url = linkUrl
            if (taskId) payload.task_id = taskId
            payload.format = 'markdown'
            const raw = await kdocs(['drive', 'read-file', JSON.stringify(payload), '--compact'], 120000)
            const data = deepestData(raw)
            writeJson(res, 200, data)
            return
          }

          writeJson(res, 404, { error: `unknown path ${pathname}` })
        } catch (error) {
          writeJson(res, 500, { error: error instanceof Error ? error.message : String(error) })
        }
      },
    }),
  )
}
