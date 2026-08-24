import { createElement, type ReactNode } from 'react'

export type FileKind =
  | 'folder'
  | 'otl'
  | 'ksheet'
  | 'form'
  | 'word'
  | 'ppt'
  | 'sheet'
  | 'pdf'
  | 'dbt'
  | 'file'

const COLORS: Record<FileKind, string> = {
  folder: '#4A90E2',
  otl: '#8B5CF6',
  ksheet: '#22A06B',
  form: '#14B8A6',
  word: '#2B6CB0',
  ppt: '#DD6B20',
  sheet: '#38A169',
  pdf: '#E53E3E',
  dbt: '#0F766E',
  file: '#64748B',
}

export function extOf(item: { name?: string; suffix?: string; type?: string }): string {
  const type = (item.type || '').toLowerCase()
  if (type === 'folder' || type === 'dir') return 'folder'
  const suffix = (item.suffix || '').toLowerCase().replace(/^\./, '')
  if (suffix) return suffix
  const name = item.name || ''
  const dot = name.lastIndexOf('.')
  if (dot <= 0) return ''
  return name.slice(dot + 1).toLowerCase()
}

export function kindOf(item: { name?: string; suffix?: string; type?: string }): FileKind {
  const ext = extOf(item)
  if (ext === 'folder') return 'folder'
  if (ext === 'otl') return 'otl'
  if (ext === 'ksheet') return 'ksheet'
  if (ext === 'form' || ext === 'pof') return 'form'
  if (ext === 'doc' || ext === 'docx' || ext === 'wdoc' || ext === 'wps') return 'word'
  if (ext === 'ppt' || ext === 'pptx' || ext === 'wppt' || ext === 'dps') return 'ppt'
  if (ext === 'xls' || ext === 'xlsx' || ext === 'et') return 'sheet'
  if (ext === 'pdf') return 'pdf'
  if (ext === 'dbt') return 'dbt'
  return 'file'
}

function glyph(kind: FileKind): string {
  if (kind === 'word') return 'W'
  if (kind === 'ppt') return 'P'
  if (kind === 'sheet') return 'S'
  if (kind === 'pdf') return 'P'
  return ''
}

export function TypeIcon(props: { kind: FileKind; size?: number }): ReactNode {
  const size = props.size ?? 16
  const kind = props.kind
  const radius = 3
  return createElement(
    'svg',
    {
      width: size,
      height: size,
      viewBox: '0 0 16 16',
      'aria-hidden': true,
      style: { flexShrink: 0 },
    },
    createElement('rect', { x: 0.5, y: 0.5, width: 15, height: 15, rx: radius, fill: COLORS[kind] }),
    kind === 'folder'
      ? createElement('path', {
          d: 'M3 5.2h4.1l.8 1.1H13V12H3V5.2z',
          fill: '#fff',
        })
      : null,
    kind === 'otl'
      ? createElement(
          'g',
          { stroke: '#fff', strokeWidth: 1.4, strokeLinecap: 'round' },
          createElement('line', { x1: 4, y1: 5.2, x2: 12, y2: 5.2 }),
          createElement('line', { x1: 4, y1: 8, x2: 10.5, y2: 8 }),
          createElement('line', { x1: 4, y1: 10.8, x2: 11.2, y2: 10.8 }),
        )
      : null,
    kind === 'ksheet'
      ? createElement('path', {
          d: 'M4.2 4.2h7.6v7.6H4.2z M8 4.2v7.6 M4.2 8h7.6',
          fill: 'none',
          stroke: '#fff',
          strokeWidth: 1.2,
        })
      : null,
    kind === 'form'
      ? createElement(
          'g',
          { fill: 'none', stroke: '#fff', strokeWidth: 1.3 },
          createElement('rect', { x: 4.2, y: 4.2, width: 7.6, height: 7.6, rx: 1 }),
          createElement('path', { d: 'M6 8.2l1.3 1.4 2.8-3.2', strokeLinecap: 'round', strokeLinejoin: 'round' }),
        )
      : null,
    kind === 'dbt'
      ? createElement(
          'g',
          { fill: '#fff' },
          createElement('rect', { x: 3.2, y: 3.6, width: 6.2, height: 3.2, rx: 0.6 }),
          createElement('rect', { x: 6.4, y: 6.4, width: 6.2, height: 3.2, rx: 0.6 }),
          createElement('rect', { x: 3.8, y: 9.4, width: 6.2, height: 3.2, rx: 0.6 }),
        )
      : null,
    kind === 'file'
      ? createElement('path', {
          d: 'M5 3.4h4.2L12 6.2V12.6H5z',
          fill: '#fff',
        })
      : null,
    glyph(kind)
      ? createElement(
          'text',
          {
            x: 8,
            y: 11.2,
            textAnchor: 'middle',
            fill: '#fff',
            fontSize: kind === 'pdf' ? 8 : 9,
            fontWeight: 700,
            fontFamily: 'system-ui, sans-serif',
          },
          glyph(kind),
        )
      : null,
  )
}
