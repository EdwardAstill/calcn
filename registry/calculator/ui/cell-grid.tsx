'use client'

import { useRef, useState, type ReactNode } from 'react'

export type GridCell = {
  text: string
  title?: string
  readOnly?: boolean
  className?: string
  content?: ReactNode
  onActivate?: () => void
  onType?: (text: string) => void
}
export type GridRow = { id: string; cells: GridCell[] }
type Position = { row: number; column: number }

export function CellGrid({ label, columns, rows, widths, emptyMessage, onActiveCellChange }: {
  label: string
  columns: string[]
  rows: GridRow[]
  widths?: string[]
  emptyMessage?: string
  onActiveCellChange?: (row: number, column: number) => void
}) {
  const root = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState<Position>({ row: 0, column: 0 })
  const [anchor, setAnchor] = useState<Position>(active)
  // Keep the keyboard entry point valid after a row is removed.
  const current = { row: Math.min(active.row, Math.max(0, rows.length - 1)), column: active.column }
  const start = { row: Math.min(anchor.row, current.row), column: Math.min(anchor.column, current.column) }
  const end = { row: Math.max(anchor.row, current.row), column: Math.max(anchor.column, current.column) }

  function select(position: Position, extend = false) {
    root.current?.querySelector<HTMLElement>(`[data-row="${position.row}"][data-column="${position.column}"]`)?.focus()
    setActive(position)
    setAnchor(extend ? anchor : position)
  }

  return (
    <div className="calculator-cell-grid" ref={root}>
      <table role="grid" aria-label={label} aria-multiselectable="true" onCopy={event => {
        if ((event.target as HTMLElement).closest('input, textarea')) return
        event.preventDefault()
        event.clipboardData.setData('text/plain', rows.slice(start.row, end.row + 1)
          .map(row => row.cells.slice(start.column, end.column + 1).map(cell => cell.text).join('\t')).join('\n'))
      }}>
        <colgroup><col style={{ width: '2.5rem' }} />{columns.map((column, index) => <col key={column} style={{ width: widths?.[index] }} />)}</colgroup>
        <thead><tr><th aria-label="Row" />{columns.map((column, index) => (
          <th scope="col" key={column}><span className="calculator-column-letter">{String.fromCharCode(65 + index)}</span>{column}</th>
        ))}</tr></thead>
        <tbody>
          {rows.map((row, rowIndex) => <tr key={row.id}>
            <th scope="row">{rowIndex + 1}</th>
            {row.cells.map((cell, columnIndex) => {
              const selected = rowIndex >= start.row && rowIndex <= end.row && columnIndex >= start.column && columnIndex <= end.column
              return <td key={columnIndex} role="gridcell" data-row={rowIndex} data-column={columnIndex}
                tabIndex={rowIndex === current.row && columnIndex === current.column ? 0 : -1}
                aria-readonly={cell.readOnly || undefined} className={cell.className}
                aria-selected={selected} aria-label={`${String.fromCharCode(65 + columnIndex)}${rowIndex + 1}: ${cell.text || 'Empty'}`}
                title={cell.title ?? cell.text} data-selected={selected || undefined}
                onFocus={event => {
                  if (event.target !== event.currentTarget) return
                  const position = { row: rowIndex, column: columnIndex }
                  setActive(position)
                  setAnchor(position)
                  onActiveCellChange?.(rowIndex, columnIndex)
                }}
                onClick={event => {
                  const position = { row: rowIndex, column: columnIndex }
                  if ((event.target as HTMLElement).closest('button, input')) {
                    setActive(position)
                    setAnchor(position)
                    onActiveCellChange?.(rowIndex, columnIndex)
                  } else select(position, event.shiftKey)
                }}
                onDoubleClick={event => {
                  if (!cell.readOnly && !(event.target as HTMLElement).closest('button, input')) cell.onActivate?.()
                }}
                onKeyDown={event => {
                  if (event.target !== event.currentTarget || event.nativeEvent.isComposing) return
                  const modifier = event.ctrlKey || event.metaKey
                  let next = { row: rowIndex, column: columnIndex }
                  switch (event.key) {
                    case 'ArrowUp': next.row--; break
                    case 'ArrowDown': next.row++; break
                    case 'ArrowLeft': next.column--; break
                    case 'ArrowRight': next.column++; break
                    case 'Home': next.column = 0; if (modifier) next.row = 0; break
                    case 'End': next.column = columns.length - 1; if (modifier) next.row = rows.length - 1; break
                    case 'Tab': {
                      const index = rowIndex * columns.length + columnIndex + (event.shiftKey ? -1 : 1)
                      if (index < 0 || index >= rows.length * columns.length) return
                      next = { row: Math.floor(index / columns.length), column: index % columns.length }
                      break
                    }
                    case 'Enter':
                    case 'F2':
                      event.preventDefault()
                      if (cell.readOnly) return
                      if (cell.onActivate) cell.onActivate()
                      else {
                        const button = event.currentTarget.querySelector<HTMLButtonElement>('button')
                        button?.focus()
                        button?.click()
                      }
                      return
                    default:
                      if (!cell.readOnly && !modifier && !event.altKey && event.key.length === 1 && cell.onType) {
                        event.preventDefault()
                        cell.onType(event.key)
                      }
                      return
                  }
                  event.preventDefault()
                  next = { row: Math.max(0, Math.min(rows.length - 1, next.row)), column: Math.max(0, Math.min(columns.length - 1, next.column)) }
                  select(next, event.shiftKey && event.key !== 'Tab')
                }}
              ><div className="calculator-cell-content">{cell.content ?? cell.text}</div></td>
            })}
          </tr>)}
          {rows.length === 0 && <tr><th scope="row">1</th>{columns.map(column => <td key={column} />)}</tr>}
        </tbody>
      </table>
      {rows.length === 0 && emptyMessage && <p className="p-3 text-xs text-muted-foreground">{emptyMessage}</p>}
    </div>
  )
}
