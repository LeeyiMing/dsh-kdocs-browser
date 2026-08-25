import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createElement } from 'react'
import { kindOf, TypeIcon } from './icons.tsx'
import { renderMarkdown, sheetRangeToMarkdown } from './markdown.ts'
import { appendToDraft, installKdocsSendHook, rememberRef } from './draft.ts'

export const inject = ['betterSidebar']

type DriveItem = {
  id: string
  name: string
  drive_id?: string
  parent_id?: string
  type?: string
  suffix?: string
  link_url?: string
}

type PreviewState =
  | { kind: 'empty' }
  | { kind: 'loading'; name: string }
  | {
      kind: 'text'
      item: DriveItem
      content: string
      markdown: boolean
      editable: boolean
      warning?: string
    }
  | { kind: 'error'; name: string; message: string }

function isFolder(item: DriveItem): boolean {
  const type = (item.type || '').toLowerCase()
  return type === 'folder' || type === 'dir' || kindOf(item) === 'folder'
}

function isOtl(item: DriveItem): boolean {
  return kindOf(item) === 'otl'
}

function FolderTabIcon(): ReactNode {
  return createElement(TypeIcon, { kind: 'folder', size: 16 })
}

function parseDragItem(event: { dataTransfer: { getData: (type: string) => string } }): DriveItem | null {
  const raw = event.dataTransfer.getData('application/x-clouddoc') || event.dataTransfer.getData('text/plain')
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as DriveItem
    return parsed && typeof parsed.id === 'string' ? parsed : null
  } catch {
    return null
  }
}

function allowMoveDrop(event: {
  preventDefault: () => void
  stopPropagation: () => void
  dataTransfer: { dropEffect: string }
}): void {
  event.preventDefault()
  event.stopPropagation()
  event.dataTransfer.dropEffect = 'move'
}

async function getJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init)
  const body = (await response.json()) as T & { error?: string }
  if (!response.ok) {
    throw new Error(body.error || `HTTP ${response.status}`)
  }
  return body
}

function isTokenExpired(message: string): boolean {
  return /Token 已失效|token.*expir|unauthorized|未登录|请重新(登录|获取)/i.test(message)
}

const CLI_DOCS = 'https://www.kdocs.cn/latest'
const CMD_LOGIN = 'kdocs-cli auth login'
const CMD_VERSION = 'kdocs-cli version'
const SKILL_DIR = '~/.dsh/skills/kdocs'
const CMD_OFFICIAL_INSTALL =
  'https://wpsai.wpscdn.cn/skillhub/pro/v2.6.3/kdocs.zip 下载 zip 包并 unzip 解压，帮我安装这个 skill，然后运行 kdocs-cli auth login 完成认证。'

function CopyBtn(props: { text: string; label?: string }): ReactNode {
  const [done, setDone] = useState(false)
  return createElement(
    'button',
    {
      type: 'button',
      style: { marginTop: 6, marginRight: 6, cursor: 'pointer' },
      onClick: () => {
        void navigator.clipboard.writeText(props.text).then(() => {
          setDone(true)
          window.setTimeout(() => setDone(false), 1500)
        })
      },
    },
    done ? '已复制' : props.label || '复制命令',
  )
}

function formatContent(data: Record<string, unknown>): string {
  const content = data.content
  if (typeof content === 'string') return content
  if (content == null) return ''
  return JSON.stringify(content, null, 2)
}

function splitOtlMarkdown(source: string): { title: string; content: string } {
  const text = source.replace(/^\uFEFF/, '')
  const match = /^#\s+(.+)\n?([\s\S]*)$/.exec(text)
  if (match) {
    return { title: match[1].trim() || '未命名文档', content: (match[2] || '').replace(/^\n/, '') }
  }
  return { title: '未命名文档', content: text }
}

function ensureSuffix(name: string, suffix: string): string {
  const ext = suffix.startsWith('.') ? suffix : `.${suffix}`
  if (!ext || ext === '.') return name
  return name.toLowerCase().endsWith(ext.toLowerCase()) ? name : `${name}${ext}`
}

async function readFileWithPoll(
  item: DriveItem,
): Promise<{ content: string; markdown: boolean; warning?: string }> {
  let taskId = ''
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const payload: Record<string, string> = {}
    if (item.id) payload.file_id = item.id
    else if (item.link_url) payload.link_url = item.link_url
    if (taskId) payload.task_id = taskId
    const data = await getJson<Record<string, unknown>>('/clouddoc/read', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const status = typeof data.status === 'string' ? data.status : 'ok'
    if (status === 'pending') {
      taskId = typeof data.task_id === 'string' ? data.task_id : taskId
      await new Promise((resolve) => setTimeout(resolve, 800))
      continue
    }
    const warnings = Array.isArray(data.warnings)
      ? data.warnings.filter((entry): entry is string => typeof entry === 'string').join('\n')
      : ''
    const format = typeof data.content_format === 'string' ? data.content_format : ''
    const sheetRange = format === 'sheet_range'
    return {
      content: sheetRange ? sheetRangeToMarkdown(data.content) : formatContent(data),
      markdown: sheetRange || format === 'markdown' || (typeof data.content === 'string' && format !== 'kdc'),
      warning: warnings || undefined,
    }
  }
  throw new Error('读取超时，文档仍在处理中')
}

function CloudDocPanel(props: { ctx: unknown; sessionId: string }): ReactNode {
  const { ctx, sessionId } = props
  const [status, setStatus] = useState<'loading' | 'no-cli' | 'need-login' | 'ready' | 'error'>('loading')
  const [error, setError] = useState('')
  const [rootDriveId, setRootDriveId] = useState('')
  const [root, setRoot] = useState<DriveItem[]>([])
  const [expanded, setExpanded] = useState<Record<string, DriveItem[] | 'loading' | 'error'>>({})
  const [preview, setPreview] = useState<PreviewState>({ kind: 'empty' })
  const [loginHint, setLoginHint] = useState('')
  const [hasSkill, setHasSkill] = useState(true)
  const [targetParent, setTargetParent] = useState('0')
  const [renamingId, setRenamingId] = useState('')
  const [dropHover, setDropHover] = useState('')
  const [pendingMove, setPendingMove] = useState<{
    source: DriveItem
    dstParentId: string
    dstDriveId?: string
    destLabel: string
  } | null>(null)

  const reload = useCallback(async () => {
    setStatus('loading')
    setError('')
    setLoginHint('')
    try {
      const probe = await getJson<{
        cli: boolean
        authenticated: boolean
        skill?: boolean
        error?: string
      }>('/clouddoc/status')
      setHasSkill(Boolean(probe.skill))
      if (!probe.cli) {
        setStatus('no-cli')
        return
      }
      if (!probe.authenticated) {
        setStatus('need-login')
        return
      }
      const page = await getJson<{ items?: DriveItem[]; drive_id?: string }>('/clouddoc/root?page_size=50')
      const items = (page.items || []).map((item) => ({
        ...item,
        drive_id: item.drive_id || page.drive_id,
        parent_id: item.parent_id || '0',
      }))
      setRoot(items)
      setRootDriveId(typeof page.drive_id === 'string' && page.drive_id ? page.drive_id : items[0]?.drive_id || '')
      setExpanded({})
      setTargetParent('0')
      setStatus('ready')
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
      setStatus(isTokenExpired(message) ? 'need-login' : 'error')
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const patchName = (fileId: string, name: string) => {
    const apply = (items: DriveItem[]) => items.map((item) => (item.id === fileId ? { ...item, name } : item))
    setRoot((prev) => apply(prev))
    setExpanded((prev) => {
      const next: typeof prev = {}
      for (const [key, value] of Object.entries(prev)) {
        next[key] = Array.isArray(value) ? apply(value) : value
      }
      return next
    })
    setPreview((prev) =>
      prev.kind === 'text' && prev.item.id === fileId ? { ...prev, item: { ...prev.item, name } } : prev,
    )
  }

  const toggleFolder = async (item: DriveItem) => {
    const driveId = item.drive_id || rootDriveId
    const parentId = isFolder(item) ? item.id : '0'
    const key = `${driveId}:${parentId}`
    setTargetParent(parentId)
    if (expanded[key] && expanded[key] !== 'error') {
      setExpanded((prev) => {
        const next = { ...prev }
        delete next[key]
        return next
      })
      return
    }
    setExpanded((prev) => ({ ...prev, [key]: 'loading' }))
    try {
      const qs = new URLSearchParams({ parent_id: parentId })
      if (driveId) qs.set('drive_id', driveId)
      const page = await getJson<{ items?: DriveItem[] }>(`/clouddoc/files?${qs.toString()}`)
      setExpanded((prev) => ({
        ...prev,
        [key]: (page.items || []).map((child) => ({
          ...child,
          drive_id: child.drive_id || driveId,
          parent_id: child.parent_id || parentId,
        })),
      }))
    } catch {
      setExpanded((prev) => ({ ...prev, [key]: 'error' }))
    }
  }

  const openFile = async (item: DriveItem) => {
    setPreview({ kind: 'loading', name: item.name })
    try {
      const result = await readFileWithPoll(item)
      setPreview({
        kind: 'text',
        item,
        content: result.content || '(空内容)',
        markdown: result.markdown,
        editable: isOtl(item),
        warning: result.warning,
      })
    } catch (err) {
      setPreview({
        kind: 'error',
        name: item.name,
        message: err instanceof Error ? err.message : String(err),
      })
    }
  }

  const renameItem = async (item: DriveItem, nextName: string) => {
    const trimmed = nextName.trim()
    setRenamingId('')
    if (!trimmed || trimmed === item.name) return
    const dstName = isFolder(item) ? trimmed : ensureSuffix(trimmed, kindOf(item) === 'file' ? '' : extFrom(item))
    try {
      await getJson('/clouddoc/rename', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ file_id: item.id, drive_id: item.drive_id || rootDriveId, dst_name: dstName }),
      })
      patchName(item.id, dstName)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const refreshParent = async (parentId: string) => {
    if (parentId === '0') {
      await reload()
      return
    }
    const qs = new URLSearchParams({ parent_id: parentId, drive_id: rootDriveId })
    const page = await getJson<{ items?: DriveItem[] }>(`/clouddoc/files?${qs.toString()}`)
    setExpanded((prev) => ({
      ...prev,
      [`${rootDriveId}:${parentId}`]: (page.items || []).map((child) => ({
        ...child,
        drive_id: child.drive_id || rootDriveId,
        parent_id: child.parent_id || parentId,
      })),
    }))
  }

  const removeItem = (fileId: string) => {
    setRoot((prev) => prev.filter((item) => item.id !== fileId))
    setExpanded((prev) => {
      const next: typeof prev = {}
      for (const [key, value] of Object.entries(prev)) {
        next[key] = Array.isArray(value) ? value.filter((item) => item.id !== fileId) : value
      }
      return next
    })
  }

  const moveItem = async (source: DriveItem, dstParentId: string, dstDriveId?: string) => {
    const destDrive = dstDriveId || source.drive_id || rootDriveId
    const fromParent = source.parent_id || '0'
    if (!source.id || !destDrive) return
    if (source.id === dstParentId) {
      setError('不能把文件夹移进自己')
      return
    }
    if (fromParent === dstParentId && (source.drive_id || rootDriveId) === destDrive) return
    try {
      await getJson<{ warning?: string }>('/clouddoc/move', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          file_id: source.id,
          drive_id: source.drive_id || rootDriveId,
          dst_drive_id: destDrive,
          dst_parent_id: dstParentId,
          type: source.type,
          name: source.name,
        }),
      }).then((result) => {
        if (result.warning) setError(result.warning)
      })
      removeItem(source.id)
      await refreshParent(dstParentId)
      if (fromParent !== dstParentId && fromParent !== '0') await refreshParent(fromParent)
      if (fromParent === '0' && dstParentId !== '0') {
        setRoot((prev) => prev.filter((item) => item.id !== source.id))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const quoteItem = (item: DriveItem) => {
    if (!sessionId) {
      setError('无法写入输入框（需要已打开的对话会话）')
      return
    }
    const ok = appendToDraft(ctx as Parameters<typeof appendToDraft>[0], sessionId, rememberRef(item))
    if (!ok) setError('无法写入输入框（需要已打开的对话会话）')
  }

  const quoteSelection = (item: DriveItem, selected: string) => {
    if (!sessionId) {
      setError('无法写入输入框（需要已打开的对话会话）')
      return
    }
    const ok = appendToDraft(
      ctx as Parameters<typeof appendToDraft>[0],
      sessionId,
      rememberRef(item, selected),
    )
    if (!ok) setError('无法写入输入框（需要已打开的对话会话）')
  }

  const requestMove = (source: DriveItem, dstParentId: string, destLabel: string, dstDriveId?: string) => {
    setDropHover('')
    if (isFolder(source)) {
      setPendingMove({ source, dstParentId, destLabel, dstDriveId })
      return
    }
    void moveItem(source, dstParentId, dstDriveId)
  }

  const createAtTarget = async (kind: 'folder' | 'otl') => {
    if (!rootDriveId) {
      setError('缺少 drive_id，请先刷新')
      return
    }
    const raw = window.prompt(kind === 'folder' ? '文件夹名称' : '智能文档名称')
    if (!raw) return
    const name = raw.trim()
    if (!name) return
    try {
      const path = kind === 'folder' ? '/clouddoc/mkdir' : '/clouddoc/create-otl'
      await getJson(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ drive_id: rootDriveId, parent_id: targetParent, name }),
      })
      await refreshParent(targetParent)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  if (status === 'loading') {
    return createElement('div', { style: pad }, '加载金山文档…')
  }
  if (status === 'no-cli') {
    return createElement(
      'div',
      { style: pad },
      createElement('strong', null, '未找到 kdocs-cli'),
      createElement(
        'div',
        { style: muted },
        '侧栏浏览需要本机 CLI。安装步骤与 README「首次安装」一致：本插件不代为执行安装脚本。',
      ),
      createElement(
        'div',
        { style: muted },
        '1. 登录金山文档，右侧栏打开「金山文档 Skill」，点「复制指令」贴到对话。示例（版本以弹窗为准）：',
      ),
      createElement('div', { style: mono }, CMD_OFFICIAL_INSTALL),
      createElement(CopyBtn, { text: CMD_OFFICIAL_INSTALL, label: '复制官方安装指令' }),
      createElement(
        'div',
        { style: muted },
        '要最新版：再打开同一入口取当前 zip 或指令。不要复制 token 到 git 或聊天记录；认证用 kdocs-cli auth login。',
      ),
      createElement('div', { style: muted }, '2. 装好后自检：'),
      createElement('div', { style: mono }, CMD_VERSION),
      createElement(CopyBtn, { text: CMD_VERSION, label: '复制自检命令' }),
      createElement('div', { style: muted }, '3. 仅登录：'),
      createElement('div', { style: mono }, CMD_LOGIN),
      createElement(CopyBtn, { text: CMD_LOGIN, label: '复制登录命令' }),
      createElement('div', { style: muted }, 'Skill 目录（浏览不依赖此项）：'),
      createElement('div', { style: mono }, SKILL_DIR),
      createElement(CopyBtn, { text: SKILL_DIR, label: '复制 Skill 目录' }),
      createElement('div', { style: muted }, '说明页：'),
      createElement('div', { style: mono }, CLI_DOCS),
      createElement(CopyBtn, { text: CLI_DOCS, label: '复制文档地址' }),
      createElement('button', { type: 'button', style: btn, onClick: () => void reload() }, '刷新'),
    )
  }
  const startLogin = async () => {
    try {
      const result = await getJson<{ hint?: string }>('/clouddoc/login', { method: 'POST' })
      setLoginHint(result.hint || '请在浏览器完成授权后点刷新。')
      setStatus('need-login')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setStatus('error')
    }
  }

  if (status === 'need-login') {
    return createElement(
      'div',
      { style: pad },
      createElement('strong', null, error && isTokenExpired(error) ? '登录已失效' : '需要登录金山文档'),
      createElement(
        'div',
        { style: muted },
        '插件会在本机启动 kdocs-cli auth login，请在弹出的浏览器里完成授权。不要把 Token 发给对话或 Agent。',
      ),
      error && isTokenExpired(error) ? createElement('div', { style: danger }, error) : null,
      loginHint ? createElement('div', { style: muted }, loginHint) : null,
      createElement('div', { style: muted }, '也可在本机终端执行：'),
      createElement('div', { style: mono }, CMD_LOGIN),
      createElement(CopyBtn, { text: CMD_LOGIN, label: '复制登录命令' }),
      createElement('button', { type: 'button', style: btn, onClick: () => void startLogin() }, '重新登录'),
      createElement('button', { type: 'button', style: btn, onClick: () => void reload() }, '我已登录，刷新'),
    )
  }
  if (status === 'error') {
    return createElement(
      'div',
      { style: pad },
      createElement('div', { style: danger }, error),
      isTokenExpired(error)
        ? createElement('button', { type: 'button', style: btn, onClick: () => void startLogin() }, '重新登录')
        : null,
      createElement('button', { type: 'button', style: btn, onClick: () => void reload() }, '重试'),
    )
  }

  return createElement(
    'div',
    { style: layout },
    createElement(
      'div',
      { style: treePane },
      createElement(
        'div',
        { style: header },
        createElement('strong', null, '金山文档'),
        createElement('button', { type: 'button', style: { ...btn, marginTop: 0 }, onClick: () => void reload() }, '刷新'),
      ),
      hasSkill
        ? null
        : createElement(
            'div',
            { style: muted },
            '未检测到 kdocs Skill（浏览不受影响）。对话里操作云文档请把官方技能放到 ',
            createElement('span', { style: mono }, SKILL_DIR),
            '。',
            createElement(CopyBtn, { text: SKILL_DIR, label: '复制 Skill 目录' }),
          ),
      createElement(
        'div',
        { style: { display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 } },
        createElement('button', { type: 'button', style: { ...btn, marginTop: 0 }, onClick: () => void createAtTarget('folder') }, '新建文件夹'),
        createElement('button', { type: 'button', style: { ...btn, marginTop: 0 }, onClick: () => void createAtTarget('otl') }, '新建智能文档'),
      ),
      createElement('div', { style: muted }, '拖文件或文件夹到目标文件夹；拖到「根目录」可移回根。单击文件夹展开，拖左侧图标移动。'),
      createElement(
        'div',
        {
          style: dropHover === 'root' ? { ...dropRoot, ...dropRootActive } : dropRoot,
          onDragOver: (event: Parameters<typeof allowMoveDrop>[0]) => {
            allowMoveDrop(event)
            setDropHover('root')
          },
          onDragLeave: (event: { currentTarget: HTMLElement; relatedTarget: EventTarget | null }) => {
            const related = event.relatedTarget
            if (related instanceof Node && event.currentTarget.contains(related)) return
            setDropHover((prev) => (prev === 'root' ? '' : prev))
          },
          onDrop: (event: {
            preventDefault: () => void
            dataTransfer: { getData: (type: string) => string }
          }) => {
            event.preventDefault()
            setDropHover('')
            const source = parseDragItem(event)
            if (source) requestMove(source, '0', '根目录', rootDriveId)
          },
        },
        dropHover === 'root' ? '松开以移到根目录' : '根目录（拖到这里）',
      ),
      pendingMove
        ? createElement(
            'div',
            { style: confirmBox },
            createElement(
              'div',
              { style: { marginBottom: 8 } },
              `将文件夹「${pendingMove.source.name}」移到「${pendingMove.destLabel}」？会在目标处重建同名文件夹并移入内容，原位置可能留下空文件夹。`,
            ),
            createElement(
              'div',
              { style: { display: 'flex', gap: 8 } },
              createElement(
                'button',
                {
                  type: 'button',
                  style: { ...btn, marginTop: 0 },
                  onClick: () => {
                    const next = pendingMove
                    setPendingMove(null)
                    void moveItem(next.source, next.dstParentId, next.dstDriveId)
                  },
                },
                '确认移动',
              ),
              createElement(
                'button',
                { type: 'button', style: { ...btn, marginTop: 0 }, onClick: () => setPendingMove(null) },
                '取消',
              ),
            ),
          )
        : null,
      error ? createElement('div', { style: danger }, error) : null,
      root.length === 0
        ? createElement('div', { style: muted }, '根目录为空')
        : root.map((item) =>
            createElement(TreeRow, {
              key: `${item.drive_id}:${item.id}`,
              item: { ...item, drive_id: item.drive_id || rootDriveId, parent_id: item.parent_id || '0' },
              expanded,
              renamingId,
              dropHover,
              onDropHover: setDropHover,
              onToggle: toggleFolder,
              onOpen: openFile,
              onStartRename: setRenamingId,
              onCommitRename: renameItem,
              onMove: requestMove,
              onQuote: quoteItem,
              canQuote: Boolean(sessionId),
              depth: 0,
            }),
          ),
    ),
    createElement(PreviewPane, {
      preview,
      canQuote: Boolean(sessionId),
      onQuoteFile: quoteItem,
      onQuoteSelection: quoteSelection,
      onSave: async (item, markdown) => {
        const parts = splitOtlMarkdown(markdown)
        await getJson('/clouddoc/save-otl', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ file_id: item.id, title: parts.title, content: parts.content }),
        })
        setPreview((prev) => (prev.kind === 'text' ? { ...prev, content: markdown } : prev))
      },
    }),
  )
}

function extFrom(item: DriveItem): string {
  const kind = kindOf(item)
  if (kind === 'folder' || kind === 'file') {
    const name = item.name || ''
    const dot = name.lastIndexOf('.')
    return dot > 0 ? name.slice(dot) : item.suffix || ''
  }
  const map: Record<string, string> = {
    otl: '.otl',
    ksheet: '.ksheet',
    form: '.form',
    word: '.docx',
    ppt: '.pptx',
    sheet: '.xlsx',
    pdf: '.pdf',
    dbt: '.dbt',
  }
  return item.suffix || map[kind] || ''
}

function PreviewPane(props: {
  preview: PreviewState
  canQuote: boolean
  onQuoteFile: (item: DriveItem) => void
  onQuoteSelection: (item: DriveItem, selected: string) => void
  onSave: (item: DriveItem, markdown: string) => Promise<void>
}): ReactNode {
  const { preview, canQuote, onQuoteFile, onQuoteSelection, onSave } = props
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [popup, setPopup] = useState<{ text: string; left: number; top: number } | null>(null)

  useEffect(() => {
    if (preview.kind === 'text') {
      setDraft(preview.content)
      setEditing(false)
      setSaveError('')
      setPopup(null)
    }
  }, [preview])

  if (preview.kind === 'empty') {
    return createElement('div', { style: previewPane }, createElement('div', { style: muted }, '点文件读取正文；智能文档可编辑保存'))
  }
  if (preview.kind === 'loading') {
    return createElement('div', { style: previewPane }, `正在读取 ${preview.name}…`)
  }
  if (preview.kind === 'error') {
    return createElement(
      'div',
      { style: previewPane },
      createElement('div', { style: { fontWeight: 600, marginBottom: 8 } }, preview.name),
      createElement('div', { style: danger }, preview.message),
    )
  }

  return createElement(
    'div',
    { style: previewPane },
    createElement('style', null, markdownCss),
    createElement(
      'div',
      { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 } },
      createElement(TypeIcon, { kind: kindOf(preview.item), size: 18 }),
      createElement('div', { style: { fontWeight: 600, flex: 1 } }, preview.item.name),
      preview.item.link_url
        ? createElement(
            'button',
            {
              type: 'button',
              style: { ...btn, marginTop: 0 },
              onClick: () => window.open(preview.item.link_url, '_blank'),
            },
            '网页打开',
          )
        : null,
      createElement(
        'button',
        {
          type: 'button',
          style: { ...btn, marginTop: 0 },
          disabled: !canQuote,
          title: canQuote ? '引用到左侧问答' : '需要已打开的对话会话',
          onClick: () => onQuoteFile(preview.item),
        },
        '引用到问答',
      ),
      preview.editable
        ? createElement(
            'button',
            {
              type: 'button',
              style: { ...btn, marginTop: 0 },
              onClick: () => setEditing((value) => !value),
            },
            editing ? '预览' : '编辑',
          )
        : null,
      preview.editable
        ? createElement(
            'button',
            {
              type: 'button',
              style: { ...btn, marginTop: 0 },
              disabled: saving,
              onClick: async () => {
                setSaving(true)
                setSaveError('')
                try {
                  await onSave(preview.item, draft)
                  setEditing(false)
                } catch (err) {
                  setSaveError(err instanceof Error ? err.message : String(err))
                } finally {
                  setSaving(false)
                }
              },
            },
            saving ? '保存中…' : '保存',
          )
        : null,
    ),
    preview.warning ? createElement('div', { style: muted }, preview.warning) : null,
    saveError ? createElement('div', { style: danger }, saveError) : null,
    preview.editable && editing
      ? createElement('textarea', {
          style: editor,
          value: draft,
          onChange: (event: { target: { value: string } }) => setDraft(event.target.value),
        })
      : preview.markdown
        ? createElement('div', {
            className: 'clouddoc-md',
            onMouseUp: (event: { clientX: number; clientY: number }) => {
              const selected = window.getSelection()?.toString() || ''
              if (!selected.trim()) {
                setPopup(null)
                return
              }
              setPopup({ text: selected, left: event.clientX, top: event.clientY })
            },
            dangerouslySetInnerHTML: { __html: renderMarkdown(editing ? draft : preview.content) },
          })
        : createElement('pre', {
            style: pre,
            onMouseUp: (event: { clientX: number; clientY: number }) => {
              const selected = window.getSelection()?.toString() || ''
              if (!selected.trim()) {
                setPopup(null)
                return
              }
              setPopup({ text: selected, left: event.clientX, top: event.clientY })
            },
          }, preview.content),
    popup
      ? createElement(
          'button',
          {
            type: 'button',
            style: {
              ...popupBtn,
              left: Math.min(Math.max(popup.left - 48, 8), window.innerWidth - 120),
              top: Math.max(popup.top - 36, 8),
            },
            disabled: !canQuote,
            onMouseDown: (event: { preventDefault: () => void }) => event.preventDefault(),
            onClick: () => {
              onQuoteSelection(preview.item, popup.text)
              setPopup(null)
              window.getSelection()?.removeAllRanges()
            },
          },
          '加入问答',
        )
      : null,
  )
}

function TreeRow(props: {
  item: DriveItem
  expanded: Record<string, DriveItem[] | 'loading' | 'error'>
  renamingId: string
  dropHover: string
  onDropHover: (id: string) => void
  onToggle: (item: DriveItem) => void
  onOpen: (item: DriveItem) => void
  onStartRename: (id: string) => void
  onCommitRename: (item: DriveItem, name: string) => void
  onMove: (source: DriveItem, dstParentId: string, destLabel: string, dstDriveId?: string) => void
  onQuote: (item: DriveItem) => void
  canQuote: boolean
  depth: number
}): ReactNode {
  const {
    item,
    expanded,
    renamingId,
    dropHover,
    onDropHover,
    onToggle,
    onOpen,
    onStartRename,
    onCommitRename,
    onMove,
    onQuote,
    canQuote,
    depth,
  } = props
  const folder = isFolder(item)
  const key = `${item.drive_id || ''}:${item.id}`
  const kids = folder ? expanded[key] : undefined
  const renaming = renamingId === item.id
  const hovering = folder && dropHover === item.id
  const skipClick = useRef(false)
  const bindDrag = !renaming
    ? {
        draggable: true,
        onDragStart: (event: {
          stopPropagation: () => void
          dataTransfer: { setData: (type: string, value: string) => void; effectAllowed: string }
        }) => {
          event.stopPropagation()
          skipClick.current = true
          event.dataTransfer.effectAllowed = 'move'
          event.dataTransfer.setData('application/x-clouddoc', JSON.stringify(item))
          event.dataTransfer.setData('text/plain', JSON.stringify(item))
        },
        onDragEnd: () => {
          window.setTimeout(() => {
            skipClick.current = false
          }, 0)
          onDropHover('')
        },
      }
    : {}
  return createElement(
    'div',
    null,
    hovering ? createElement('div', { style: { ...dropLine, marginLeft: 8 + depth * 12 } }) : null,
    createElement(
      'div',
      {
        ...bindDrag,
        style: {
          ...rowBtn,
          paddingLeft: 8 + depth * 12,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          cursor: 'grab',
          background: hovering ? 'color-mix(in srgb, currentColor 12%, transparent)' : 'transparent',
        },
        title: '单击打开，双击重命名；拖动整行可移动',
        onDragOver: folder
          ? (event: Parameters<typeof allowMoveDrop>[0]) => {
              allowMoveDrop(event)
              onDropHover(item.id)
            }
          : undefined,
        onDragLeave: folder
          ? (event: { currentTarget: HTMLElement; relatedTarget: EventTarget | null }) => {
              const related = event.relatedTarget
              if (related instanceof Node && event.currentTarget.contains(related)) return
              onDropHover('')
            }
          : undefined,
        onDrop: folder
          ? (event: {
              preventDefault: () => void
              stopPropagation: () => void
              dataTransfer: { getData: (type: string) => string }
            }) => {
              event.preventDefault()
              event.stopPropagation()
              onDropHover('')
              const source = parseDragItem(event)
              if (source) onMove(source, item.id, item.name, item.drive_id)
            }
          : undefined,
        onClick: () => {
          if (skipClick.current || renaming) return
          if (folder) onToggle(item)
          else void onOpen(item)
        },
        onDoubleClick: (event: { stopPropagation: () => void }) => {
          event.stopPropagation()
          onStartRename(item.id)
        },
      },
      createElement(TypeIcon, { kind: kindOf(item), size: 16 }),
      renaming
        ? createElement('input', {
            defaultValue: item.name,
            autoFocus: true,
            style: { flex: 1, fontSize: 13 },
            onClick: (event: { stopPropagation: () => void }) => event.stopPropagation(),
            onBlur: (event: { target: { value: string } }) => onCommitRename(item, event.target.value),
            onKeyDown: (event: { key: string; currentTarget: { value: string } }) => {
              if (event.key === 'Enter') onCommitRename(item, event.currentTarget.value)
              if (event.key === 'Escape') onStartRename('')
            },
          })
        : createElement(
            'span',
            { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 } },
            hovering ? `放入「${item.name}」` : item.name || item.id,
          ),
      createElement(
        'button',
        {
          type: 'button',
          draggable: false,
          disabled: !canQuote,
          title: canQuote ? '引用到左侧问答' : '需要已打开的对话会话',
          style: quoteChip,
          onMouseDown: (event: { stopPropagation: () => void; preventDefault: () => void }) => {
            event.stopPropagation()
            event.preventDefault()
          },
          onClick: (event: { stopPropagation: () => void }) => {
            event.stopPropagation()
            onQuote(item)
          },
        },
        '@',
      ),
    ),
    kids === 'loading'
      ? createElement('div', { style: { ...muted, paddingLeft: 24 + depth * 12 } }, '加载中…')
      : null,
    kids === 'error'
      ? createElement('div', { style: { ...muted, paddingLeft: 24 + depth * 12 } }, '加载失败')
      : null,
    Array.isArray(kids)
      ? kids.map((child) =>
          createElement(TreeRow, {
            key: `${child.drive_id}:${child.id}`,
            item: {
              ...child,
              drive_id: child.drive_id || item.drive_id,
              parent_id: child.parent_id || item.id,
            },
            expanded,
            renamingId,
            dropHover,
            onDropHover,
            onToggle,
            onOpen,
            onStartRename,
            onCommitRename,
            onMove,
            onQuote,
            canQuote,
            depth: depth + 1,
          }),
        )
      : null,
  )
}

const pad: CSSProperties = { padding: 12, fontSize: 13, lineHeight: 1.45 }
const btn: CSSProperties = { marginTop: 8, cursor: 'pointer' }
const muted: CSSProperties = { opacity: 0.65, fontSize: 12, margin: '6px 0' }
const mono: CSSProperties = { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', fontSize: 12, wordBreak: 'break-all' }
const danger: CSSProperties = { color: 'var(--dsh-danger, #c00)' }
const layout: CSSProperties = { display: 'flex', height: '100%', minHeight: 0 }
const treePane: CSSProperties = {
  width: '42%',
  overflow: 'auto',
  borderRight: '1px solid color-mix(in srgb, currentColor 15%, transparent)',
  padding: 8,
}
const previewPane: CSSProperties = { flex: 1, overflow: 'auto', padding: 12, fontSize: 13, position: 'relative' }
const header: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: 8,
}
const dropRoot: CSSProperties = {
  border: '1px dashed color-mix(in srgb, currentColor 30%, transparent)',
  borderRadius: 6,
  padding: '6px 8px',
  fontSize: 12,
  opacity: 0.8,
  marginBottom: 8,
  textAlign: 'center',
}
const dropRootActive: CSSProperties = {
  borderColor: '#4A90E2',
  background: 'color-mix(in srgb, #4A90E2 18%, transparent)',
  opacity: 1,
  fontWeight: 600,
}
const dropLine: CSSProperties = {
  height: 2,
  background: '#4A90E2',
  borderRadius: 1,
  marginBottom: 2,
  marginRight: 8,
}
const confirmBox: CSSProperties = {
  border: '1px solid color-mix(in srgb, currentColor 25%, transparent)',
  borderRadius: 6,
  padding: 8,
  marginBottom: 8,
  fontSize: 12,
  lineHeight: 1.45,
}
const markdownCss = `
.clouddoc-md { font-size: 13px; line-height: 1.55; word-break: break-word; }
.clouddoc-md h1, .clouddoc-md h2, .clouddoc-md h3, .clouddoc-md h4 { margin: 1em 0 0.4em; line-height: 1.3; }
.clouddoc-md h1 { font-size: 1.45em; } .clouddoc-md h2 { font-size: 1.25em; } .clouddoc-md h3 { font-size: 1.1em; }
.clouddoc-md p { margin: 0.55em 0; }
.clouddoc-md ul, .clouddoc-md ol { margin: 0.4em 0; padding-left: 1.4em; }
.clouddoc-md code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 0.9em; background: color-mix(in srgb, currentColor 10%, transparent); padding: 0.1em 0.3em; border-radius: 3px; }
.clouddoc-md pre { overflow: auto; padding: 8px; border-radius: 6px; background: color-mix(in srgb, currentColor 8%, transparent); }
.clouddoc-md pre code { background: none; padding: 0; }
.clouddoc-md table { border-collapse: collapse; width: 100%; margin: 0.6em 0; font-size: 12px; }
.clouddoc-md th, .clouddoc-md td { border: 1px solid color-mix(in srgb, currentColor 20%, transparent); padding: 4px 8px; text-align: left; }
.clouddoc-md blockquote { margin: 0.6em 0; padding-left: 10px; border-left: 3px solid color-mix(in srgb, currentColor 30%, transparent); opacity: 0.9; }
.clouddoc-md img { max-width: 100%; }
.clouddoc-md a { color: inherit; text-decoration: underline; }
`
const pre: CSSProperties = {
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  fontSize: 12,
  margin: 0,
}
const editor: CSSProperties = {
  width: '100%',
  minHeight: 280,
  boxSizing: 'border-box',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  fontSize: 12,
  lineHeight: 1.5,
}
const quoteChip: CSSProperties = {
  flexShrink: 0,
  cursor: 'pointer',
  border: 0,
  background: 'color-mix(in srgb, currentColor 10%, transparent)',
  color: 'inherit',
  borderRadius: 4,
  fontSize: 11,
  padding: '0 6px',
  height: 20,
}
const popupBtn: CSSProperties = {
  position: 'fixed',
  zIndex: 20,
  cursor: 'pointer',
  fontSize: 12,
  padding: '4px 8px',
}
const rowBtn: CSSProperties = {
  width: '100%',
  textAlign: 'left',
  background: 'transparent',
  border: 0,
  color: 'inherit',
  cursor: 'pointer',
  padding: '4px 8px',
}

export function apply(ctx: {
  betterSidebar?: { registerTab: (desc: Record<string, unknown>) => () => void }
  effect: (fn: () => unknown) => void
  inject?: (deps: string[], fn: (sub: { get: (name: string) => unknown; conversation?: unknown }) => void) => void
  sessions?: { scope: (id: string) => unknown }
  get?: (name: string) => unknown
}): void {
  const hookConversation = (conversation: unknown) => {
    if (conversation) installKdocsSendHook(conversation)
  }
  hookConversation(ctx.get?.('conversation'))
  if (typeof ctx.inject === 'function') {
    try {
      ctx.inject(['conversation'], (sub) => {
        hookConversation(sub.conversation ?? sub.get('conversation'))
      })
    } catch {
      /* conversation 尚未就绪时忽略，引用时再试 */
    }
  }
  if (!ctx.betterSidebar) return
  ctx.effect(() =>
    ctx.betterSidebar!.registerTab({
      id: 'kdocs-browser',
      title: () => '金山文档',
      icon: (size: number) =>
        createElement('span', { style: { width: size, height: size, display: 'inline-flex' } }, createElement(FolderTabIcon)),
      order: 15,
      single: true,
      component: (props: { ctx: unknown; scope?: { sessionId?: string } }) =>
        createElement(CloudDocPanel, {
          ctx: props.ctx ?? ctx,
          sessionId: props.scope?.sessionId || '',
        }),
    }),
  )
}
