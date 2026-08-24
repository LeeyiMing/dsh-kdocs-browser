export const SELECTION_LIMIT = 500

export type QuoteItem = {
  id: string
  name: string
  type?: string
  link_url?: string
}

type KdocsRef = {
  token: string
  name: string
  file_id: string
  type: string
  url?: string
  excerpt?: string
}

const HOOK_MARKER = '__dshClouddocSendHooked'
const refs = new Map<string, KdocsRef>()

export function tokenOf(item: QuoteItem): string {
  const base = item.name.replace(/[/\\\s]+/g, '_').replace(/^_+|_+$/g, '') || item.id.slice(-8)
  const token = `@云文档/${base}`
  const existing = refs.get(token)
  if (existing && existing.file_id !== item.id) {
    return `@云文档/${base}~${item.id.slice(-6)}`
  }
  return token
}

export function rememberRef(item: QuoteItem, excerpt?: string): string {
  const token = tokenOf(item)
  const prev = refs.get(token)
  const clipped = excerpt?.trim() ?? ''
  refs.set(token, {
    token,
    name: item.name,
    file_id: item.id,
    type: (item.type || 'file').toLowerCase(),
    url: item.link_url,
    excerpt: clipped.length === 0 ? prev?.excerpt : clipped.length > SELECTION_LIMIT ? undefined : clipped,
  })
  return token
}

export function expandKdocsMentions(text: string): string {
  if (!text) return text
  const blocks: string[] = []
  const used = new Set<string>()
  for (const [token, ref] of refs) {
    if (!text.includes(token) || used.has(ref.file_id)) continue
    used.add(ref.file_id)
    blocks.push(formatBlock(ref))
  }
  if (blocks.length === 0) return text
  if (text.includes('\n[kdocs]')) return text
  return `${text.trimEnd()}\n\n${blocks.join('\n')}`
}

function formatBlock(ref: KdocsRef): string {
  const lines = ['[kdocs]', `name: ${ref.name}`, `file_id: ${ref.file_id}`, `type: ${ref.type}`]
  if (ref.url) lines.push(`url: ${ref.url}`)
  if (ref.excerpt) lines.push(`excerpt: ${ref.excerpt}`)
  return lines.join('\n')
}

export function appendToDraft(
  ctx: {
    sessions?: { scope: (id: string) => unknown }
    get?: (name: string) => {
      input?: {
        for: (scope: unknown) => {
          state: { getSnapshot: () => { draft: string } }
          setDraft: (text: string) => void
        }
      }
    }
  },
  sessionId: string,
  token: string,
): boolean {
  try {
    const actx = ctx.sessions?.scope(sessionId)
    if (actx === undefined) return false
    const conversation = ctx.get?.('conversation')
    installKdocsSendHook(conversation)
    const input = conversation?.input?.for(actx)
    if (!input) return false
    const draft = input.state.getSnapshot().draft
    if (draft.includes(token)) return true
    input.setDraft(draft.trim() === '' ? token : `${draft.trimEnd()} ${token}`)
    return true
  } catch {
    return false
  }
}

export function installKdocsSendHook(conversation: unknown): void {
  const face = conversation as {
    send?: (text: string) => Promise<void>
    sendSession?: (session: unknown, text: string, imageIds: readonly string[], mode: string) => Promise<void>
  } & Record<string, unknown>
  if (!face || typeof face !== 'object') return
  if (face[HOOK_MARKER] === true) return
  if (typeof face.sendSession === 'function') {
    const original = face.sendSession.bind(face)
    face.sendSession = (session, text, imageIds, mode) => original(session, expandKdocsMentions(text), imageIds, mode)
  }
  if (typeof face.send === 'function') {
    const originalSend = face.send.bind(face)
    face.send = (text) => originalSend(expandKdocsMentions(text))
  }
  face[HOOK_MARKER] = true
}
