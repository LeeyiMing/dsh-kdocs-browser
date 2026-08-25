/** Compact markdown → HTML. Output only contains renderer tags (source is escaped). */

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function safeUrl(raw: string): string | null {
  const trimmed = raw.trim()
  if (trimmed === '') return null
  if (trimmed.startsWith('#')) return trimmed
  const scheme = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(trimmed)
  if (scheme === null) return trimmed
  const name = scheme[1].toLowerCase()
  return name === 'http' || name === 'https' || name === 'mailto' ? trimmed : null
}

export function renderInline(text: string): string {
  let out = ''
  let i = 0
  const n = text.length
  while (i < n) {
    const char = text[i]
    if (char === '`') {
      const end = text.indexOf('`', i + 1)
      if (end !== -1) {
        out += `<code>${escapeHtml(text.slice(i + 1, end))}</code>`
        i = end + 1
        continue
      }
    }
    if (char === '!' && text[i + 1] === '[') {
      const close = text.indexOf('](', i + 2)
      if (close !== -1) {
        const parenEnd = text.indexOf(')', close + 2)
        if (parenEnd !== -1) {
          const alt = text.slice(i + 2, close)
          const src = text.slice(close + 2, parenEnd)
          const safe = safeUrl(src)
          if (safe === null) {
            out += escapeHtml(alt)
          } else {
            const srcEsc = escapeHtml(safe).replace(/\s+/g, '%20')
            out += `<img alt="${escapeHtml(alt)}" src="${srcEsc}" />`
          }
          i = parenEnd + 1
          continue
        }
      }
    }
    if (char === '[') {
      const close = text.indexOf('](', i + 1)
      if (close !== -1) {
        const parenEnd = text.indexOf(')', close + 2)
        if (parenEnd !== -1) {
          const label = text.slice(i + 1, close)
          const href = text.slice(close + 2, parenEnd)
          const safe = safeUrl(href)
          if (safe === null) {
            out += renderInline(label)
          } else {
            out += `<a href="${escapeHtml(safe)}" target="_blank" rel="noopener noreferrer">${renderInline(label)}</a>`
          }
          i = parenEnd + 1
          continue
        }
      }
    }
    if (char === '*' && text[i + 1] === '*') {
      const end = text.indexOf('**', i + 2)
      if (end !== -1) {
        out += `<strong>${renderInline(text.slice(i + 2, end))}</strong>`
        i = end + 2
        continue
      }
    }
    if (char === '*' && text[i - 1] !== '*' && text[i + 1] !== '*') {
      const end = text.indexOf('*', i + 1)
      if (end !== -1 && text[end + 1] !== '*') {
        out += `<em>${renderInline(text.slice(i + 1, end))}</em>`
        i = end + 1
        continue
      }
    }
    if (char === '~' && text[i + 1] === '~') {
      const end = text.indexOf('~~', i + 2)
      if (end !== -1) {
        out += `<del>${renderInline(text.slice(i + 2, end))}</del>`
        i = end + 2
        continue
      }
    }
    out += escapeHtml(char)
    i += 1
  }
  return out
}

export function renderMarkdown(source: string): string {
  const lines = source.replace(/\r\n/g, '\n').split('\n')
  const out: string[] = []
  let i = 0
  const n = lines.length
  const flushParagraph = (buffer: string[]): void => {
    if (buffer.length === 0) return
    out.push(`<p>${renderInline(buffer.join('\n'))}</p>`)
    buffer.length = 0
  }
  const paragraph: string[] = []
  while (i < n) {
    const line = lines[i]
    const fence = /^```([\w+-]*)\s*$/.exec(line)
    if (fence !== null) {
      flushParagraph(paragraph)
      const lang = fence[1] ?? ''
      i += 1
      const code: string[] = []
      while (i < n && !/^```\s*$/.test(lines[i])) {
        code.push(lines[i])
        i += 1
      }
      i += 1
      const langAttr = lang === '' ? '' : ` class="language-${escapeHtml(lang)}"`
      out.push(`<pre${langAttr}><code>${escapeHtml(code.join('\n'))}</code></pre>`)
      continue
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line)
    if (heading !== null) {
      flushParagraph(paragraph)
      const level = heading[1].length
      out.push(`<h${level}>${renderInline(heading[2] ?? '')}</h${level}>`)
      i += 1
      continue
    }
    if (/^\s*(---+|\*\*\*+|___+)\s*$/.test(line)) {
      flushParagraph(paragraph)
      out.push('<hr />')
      i += 1
      continue
    }
    if (line.includes('|') && i + 1 < n && /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i + 1]) && lines[i + 1].includes('-')) {
      flushParagraph(paragraph)
      const headerCells = splitTableRow(line)
      i += 2
      const rows: string[][] = []
      while (i < n && lines[i].includes('|')) {
        rows.push(splitTableRow(lines[i]))
        i += 1
      }
      out.push('<table>')
      out.push(`<thead><tr>${headerCells.map((cell) => `<th>${renderInline(cell)}</th>`).join('')}</tr></thead>`)
      if (rows.length > 0) {
        out.push(
          `<tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${renderInline(cell)}</td>`).join('')}</tr>`).join('')}</tbody>`,
        )
      }
      out.push('</table>')
      continue
    }
    const quote = /^>\s?(.*)$/.exec(line)
    if (quote !== null) {
      flushParagraph(paragraph)
      const body: string[] = []
      while (i < n) {
        const q = /^>\s?(.*)$/.exec(lines[i])
        if (q === null) break
        body.push(q[1] ?? '')
        i += 1
      }
      out.push(`<blockquote><p>${body.map((item) => renderInline(item)).join('<br />')}</p></blockquote>`)
      continue
    }
    const ul = /^\s*([-*+])\s+(.*)$/.exec(line)
    if (ul !== null) {
      flushParagraph(paragraph)
      const items: string[] = []
      while (i < n) {
        const item = /^\s*([-*+])\s+(.*)$/.exec(lines[i])
        if (item === null) break
        items.push(`<li>${renderInline(item[2] ?? '')}</li>`)
        i += 1
      }
      out.push(`<ul>${items.join('')}</ul>`)
      continue
    }
    const ol = /^\s*\d+[.)]\s+(.*)$/.exec(line)
    if (ol !== null) {
      flushParagraph(paragraph)
      const items: string[] = []
      while (i < n) {
        const item = /^\s*\d+[.)]\s+(.*)$/.exec(lines[i])
        if (item === null) break
        items.push(`<li>${renderInline(item[1] ?? '')}</li>`)
        i += 1
      }
      out.push(`<ol>${items.join('')}</ol>`)
      continue
    }
    if (line.trim() === '') {
      flushParagraph(paragraph)
      i += 1
      continue
    }
    paragraph.push(line)
    i += 1
  }
  flushParagraph(paragraph)
  return out.join('\n')
}

function splitTableRow(line: string): string[] {
  const trimmed = line.trim()
  const inner = trimmed.startsWith('|') ? trimmed.slice(1) : trimmed
  const withoutTrailing = inner.endsWith('|') ? inner.slice(0, -1) : inner
  // Split on unescaped pipes only (`\|` stays inside the cell as a literal `|`).
  const cells: string[] = []
  let current = ''
  let escaped = false
  for (const char of withoutTrailing) {
    if (escaped) {
      current += char
      escaped = false
    } else if (char === '\\') {
      escaped = true
    } else if (char === '|') {
      cells.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  if (escaped) current += '\\'
  cells.push(current.trim())
  return cells
}

/**
 * Convert the structured `content_format: "sheet_range"` payload from
 * `drive read-file` into a Markdown table so the sidebar preview can render
 * spreadsheets (xlsx / ksheet) as a real table instead of raw JSON.
 */
export function sheetRangeToMarkdown(content: unknown): string {
  const obj = content as {
    range_data?: { detail?: { rangeData?: Array<Record<string, unknown>> } }
    sheets_info?: { detail?: { sheetsInfo?: Array<{ sheetName?: string }> } }
  }
  const cells = obj?.range_data?.detail?.rangeData
  if (!Array.isArray(cells) || cells.length === 0) return '(空表格)'

  let maxRow = 0
  let maxCol = 0
  const parsed = cells.map((cell) => {
    const row = Number(cell.originRow ?? cell.rowFrom ?? 0) || 0
    const col = Number(cell.originCol ?? cell.colFrom ?? 0) || 0
    if (row > maxRow) maxRow = row
    if (col > maxCol) maxCol = col
    return { row, col, text: String(cell.cellText ?? '') }
  })
  const grid: string[][] = Array.from({ length: maxRow + 1 }, () => Array(maxCol + 1).fill(''))
  for (const cell of parsed) {
    grid[cell.row][cell.col] = cell.text.replace(/\r?\n/g, ' ').replace(/\|/g, '\\|')
  }
  const lines = grid.map((row) => `| ${row.join(' | ')} |`)
  const separator = `| ${grid[0].map(() => '---').join(' | ')} |`

  const sheetName = Array.isArray(obj?.sheets_info?.detail?.sheetsInfo)
    ? obj.sheets_info?.detail?.sheetsInfo[0]?.sheetName
    : undefined
  const heading = sheetName ? `> 工作表：${sheetName}\n\n` : ''
  return `${heading}${[lines[0], separator, ...lines.slice(1)].join('\n')}`
}
