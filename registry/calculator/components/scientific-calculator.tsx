'use client'

import '@/registry/calculator/ui/math.css'

import { BookOpen, CircleHelp, Ellipsis, LockKeyhole, Pencil, Plus, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useReducer, useRef, useState, useSyncExternalStore } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Field, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field'
import { Kbd } from '@/components/ui/kbd'
import { CellGrid, type GridCell } from '@/registry/calculator/ui/cell-grid'
import { CalculatorMathProvider, MathExpression } from '@/registry/calculator/ui/math'
import { OperationLabel } from '@/registry/calculator/ui/operation-label'
import { ResultCard } from '@/registry/calculator/ui/result-card'
import { completeFunction, functionHint } from '@/registry/calculator/lib/completion'
import { relationToMathMl } from '@/registry/calculator/lib/dsl/mathml'
import { parseRelation } from '@/registry/calculator/lib/dsl/parser'
import { HELP_CONTENT_HTML } from '@/registry/calculator/lib/generated/help-content'
import { EQUATION_LIBRARY } from '@/registry/calculator/lib/generated/equation-library'
import { initialCalculatorState, type CalculatorAction, type CalculatorState, type Relation } from '@/registry/calculator/lib/model'
import { applyInsertion, OPERATION_GROUPS } from '@/registry/calculator/lib/operations'
import { calculatorReducer } from '@/registry/calculator/lib/reducer'
import { parseVariable, variableRows, workspaceRelations, type VariableRow } from '@/registry/calculator/lib/workspace'
import { createSolverClient, type SolverClient, type SolverEngineSnapshot } from '@/registry/calculator/lib/solver/client'
import { preflight } from '@/registry/calculator/lib/solver/preflight'
import type { SolverResult } from '@/registry/calculator/lib/solver/protocol'

type ScientificCalculatorProps = { solverClient?: SolverClient }
type GridName = 'Equations' | 'Variables'
type CellPosition = { grid: GridName; row: number; column: number }
type EditTarget = CellPosition & { id: string | null; name: string; source: string }

const IDLE_ENGINE: SolverEngineSnapshot = { phase: 'idle' }
const LIBRARY_EQUATIONS = EQUATION_LIBRARY.flatMap(file => file.groups.flatMap(group => group.equations))

export function ScientificCalculator(props: ScientificCalculatorProps) {
  return <CalculatorMathProvider><CalculatorWorkspace {...props} /></CalculatorMathProvider>
}

function CalculatorWorkspace({ solverClient }: ScientificCalculatorProps) {
  const client = useMemo(() => solverClient ?? createSolverClient(), [solverClient])
  const [state, dispatch] = useReducer(calculatorReducer, initialCalculatorState)
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null)
  const [picker, setPicker] = useState<'functions' | 'equations' | null>(null)
  const [pendingGroup, setPendingGroup] = useState<string | null>(null)
  const [selectedEquations, setSelectedEquations] = useState<Set<typeof LIBRARY_EQUATIONS[number]>>(new Set())
  const [editorError, setEditorError] = useState<string | null>(null)
  const [retryCount, setRetryCount] = useState(0)
  const [editorFocused, setEditorFocused] = useState(false)
  const [editorScroll, setEditorScroll] = useState(0)
  const [caret, setCaret] = useState(0)
  const editorRef = useRef<HTMLInputElement>(null)
  const workspaceRef = useRef<HTMLElement>(null)
  const operationGroupRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const activeCell = useRef<CellPosition>({ grid: 'Equations', row: 0, column: 0 })
  const rowSequence = useRef(0)
  const requestSequence = useRef(0)
  const shortcutFocusFrame = useRef(0)
  const editingName = editTarget?.grid === 'Variables' && editTarget.column === 0
  const completion = editTarget && !editingName && editorFocused ? completeFunction(state.source, caret) : null
  const hint = editTarget && !editingName ? functionHint(state.source, caret) : null
  const result = state.solver.phase === 'complete' ? state.solver.result : undefined
  const variables = useMemo(() => variableRows(state.relations, state.variables, result), [state.relations, state.variables, result])
  const selectedVariable = activeCell.current.grid === 'Variables' ? variables[activeCell.current.row] : undefined
  const functionInsertionLocked = Boolean(editingName || (!editTarget && selectedVariable?.locked))
  const engine = useSyncExternalStore(listener => client.subscribe(listener), () => client.getSnapshot(), () => IDLE_ENGINE)

  useEffect(() => {
    client.start()
    if (!solverClient) return () => client.dispose()
  }, [client, solverClient])

  useEffect(() => {
    const frame = requestAnimationFrame(() => focusCell({ grid: 'Equations', row: 0, column: 0 }))
    return () => { cancelAnimationFrame(frame); cancelAnimationFrame(shortcutFocusFrame.current) }
  }, [])

  useEffect(() => {
    const relations = workspaceRelations(state.relations, state.variables)
    if (!relations.length) return
    let current = true
    const requestId = `calculation-${++requestSequence.current}`
    dispatch({ type: 'solve-started', requestId })
    const validation = preflight(relations)
    const calculation = validation.ok
      ? client.solve(relations, 'workspace')
      : Promise.resolve<SolverResult>({ ...validation, status: 'overdefined' })
    void calculation.catch(error => ({ status: 'error', message: error instanceof Error ? error.message : 'The solver stopped unexpectedly.' } as SolverResult))
      .then(result => { if (current) dispatch({ type: 'solve-finished', requestId, result }) })
    return () => { current = false }
  }, [client, state.relations, state.variables, retryCount])

  function focusCell(position: CellPosition) {
    workspaceRef.current?.querySelector<HTMLElement>(`[aria-label="${position.grid}"] [data-row="${position.row}"][data-column="${position.column}"]`)?.focus()
  }

  function returnToCell() {
    const { grid, row, column } = activeCell.current
    return editorRef.current ?? workspaceRef.current?.querySelector<HTMLElement>(`[aria-label="${grid}"] [data-row="${row}"][data-column="${column}"]`)
      ?? workspaceRef.current?.querySelector<HTMLElement>('[aria-label="Equations"] [role="gridcell"]') ?? null
  }

  function commitCell(): CalculatorState | null {
    if (!editTarget) return state
    try {
      let action: CalculatorAction
      if (editTarget.grid === 'Equations') {
        if (!state.source.trim() && !editTarget.id) action = { type: 'clear-editor' }
        else {
          const ast = parseRelation(state.source)
          if (ast.kind !== 'equation') throw new Error('Enter an equation with =. Put values and expressions in Variables.')
          action = { type: 'save', id: editTarget.id ?? `equation-${++rowSequence.current}`, source: state.source.trim(), ast, now: rowSequence.current }
        }
      } else {
        const variable = parseVariable(editTarget.column === 0 ? state.source : editTarget.name, editTarget.column === 1 ? state.source : editTarget.source)
        if (variable.name && variables.some(row => row.name === variable.name && row.id !== editTarget.id)) {
          throw new Error(`${variable.name} already has a row. Edit its value there.`)
        }
        action = !variable.name && !variable.source
          ? { type: 'variable-deleted', id: editTarget.id! }
          : { type: 'variable-saved', variable: { id: editTarget.id!, ...variable } }
      }
      const next = calculatorReducer(state, action)
      dispatch(action)
      setEditTarget(null)
      setEditorError(null)
      return next
    } catch (error) {
      setEditorError(error instanceof Error ? error.message : 'This cell is not valid.')
      requestAnimationFrame(() => editorRef.current?.focus())
      return null
    }
  }

  function cancelCell() {
    const position = editTarget
    dispatch({ type: 'clear-editor' })
    setEditTarget(null)
    setEditorError(null)
    if (position) requestAnimationFrame(() => focusCell(position))
  }

  function startEdit(target: EditTarget, replacement?: string) {
    if (editTarget?.grid === target.grid && editTarget.id === target.id && editTarget.column === target.column && replacement === undefined) {
      editorRef.current?.focus()
      return
    }
    if (editTarget && !commitCell()) return
    dispatch(target.grid === 'Equations' && target.id ? { type: 'edit', id: target.id } : { type: 'clear-editor' })
    dispatch({ type: 'source-changed', source: replacement ?? (target.grid === 'Variables' && target.column === 0 ? target.name : target.source) })
    setEditTarget(target)
    setEditorError(null)
    activeCell.current = target
    requestAnimationFrame(() => editorRef.current?.focus())
  }

  function selectCell(position: CellPosition) {
    if (editTarget && (editTarget.grid !== position.grid || editTarget.row !== position.row || editTarget.column !== position.column)) {
      if (!commitCell()) return
    }
    activeCell.current = position
  }

  function equationTarget(row: number): EditTarget {
    const equation = state.relations[row]
    return { grid: 'Equations', row, column: 0, id: equation?.id ?? null, source: equation?.source ?? '', name: '' }
  }

  function variableTarget(row: number, column: number): EditTarget {
    const variable = variables[row]
    return { grid: 'Variables', row, column, id: variable?.id ?? `variable-${++rowSequence.current}`, name: variable?.name ?? '', source: variable?.source ?? '' }
  }

  function toggleEquation(equation: typeof LIBRARY_EQUATIONS[number]) {
    setSelectedEquations(previous => {
      const next = new Set(previous)
      if (next.has(equation)) next.delete(equation)
      else next.add(equation)
      return next
    })
  }

  function addLibraryEquations(equations = LIBRARY_EQUATIONS.filter(equation => selectedEquations.has(equation))) {
    const relations = equations.map(equation => ({ id: `equation-${++rowSequence.current}`, source: equation.source, ast: equation.ast, createdAt: rowSequence.current, enabled: true }))
    dispatch({ type: 'library-added', relations })
    setSelectedEquations(new Set())
    setPicker(null)
  }

  function insertOperation(template: string) {
    if (functionInsertionLocked) return
    const target = editTarget ?? (activeCell.current.grid === 'Equations' ? equationTarget(activeCell.current.row) : variableTarget(activeCell.current.row, 1))
    const source = editTarget ? state.source : target.source
    const insertion = applyInsertion(source, {
      start: editTarget ? editorRef.current?.selectionStart ?? source.length : source.length,
      end: editTarget ? editorRef.current?.selectionEnd ?? source.length : source.length,
    }, template)
    if (!editTarget) startEdit(target)
    dispatch({ type: 'source-changed', source: insertion.source })
    setPicker(null)
    shortcutFocusFrame.current = requestAnimationFrame(() => {
      editorRef.current?.focus()
      editorRef.current?.setSelectionRange(insertion.selection.start, insertion.selection.end)
    })
  }

  function handleShortcuts(event: KeyboardEvent) {
    if (event.isComposing || event.repeat) return
    const key = event.key.toLowerCase()
    const target = event.target as HTMLElement
    if (target.closest('[role="menu"]')) return
    if (event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey && ['f', 'o', 'e', 'r', 'l'].includes(key)) {
      event.preventDefault()
      event.stopPropagation()
      setPendingGroup(null)
      dispatch({ type: 'help-changed', open: false })
      if (key === 'o') setPicker('functions')
      else if (key === 'e' || key === 'l') setPicker('equations')
      else {
        setPicker(null)
        shortcutFocusFrame.current = requestAnimationFrame(() => focusCell({ grid: 'Variables', row: 0, column: variables.length ? 1 : 0 }))
      }
      return
    }
    if (target.closest('[role="dialog"]') && !target.closest('[data-functions-picker]')) return
    if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return
    if (target.closest('input, [role="gridcell"]')) return
    if (key === 'escape') {
      if (picker) return
      event.preventDefault()
      setPendingGroup(null)
      returnToCell()?.focus()
      return
    }
    if (pendingGroup) {
      const group = OPERATION_GROUPS.find(group => group.shortcut === pendingGroup)!
      const item = group.items.find(item => item.shortcut === key)
      setPendingGroup(null)
      if (item) { event.preventDefault(); insertOperation(item.template) }
      return
    }
    const group = OPERATION_GROUPS.find(group => group.shortcut === key)
    if (group) {
      event.preventDefault()
      setPicker('functions')
      setPendingGroup(group.shortcut)
      shortcutFocusFrame.current = requestAnimationFrame(() => operationGroupRefs.current[group.shortcut]?.focus())
    }
  }

  useEffect(() => {
    window.addEventListener('keydown', handleShortcuts, true)
    return () => window.removeEventListener('keydown', handleShortcuts, true)
  })

  function cellEditor() {
    return (
      <div className="w-full min-w-0 whitespace-normal">
        <div className="relative font-mono">
          {completion && <div aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center overflow-hidden">
            <span className="whitespace-pre" style={{ transform: `translateX(-${editorScroll}px)` }}><span className="invisible">{state.source}</span><span className="text-muted-foreground/60">{completion.suffix}</span></span>
          </div>}
          <input ref={editorRef} className="w-full min-w-0 bg-transparent py-1 outline-none"
            aria-label={`${editTarget!.grid} ${String.fromCharCode(65 + editTarget!.column)}${editTarget!.row + 1} ${editingName ? 'name' : 'expression'}`}
            aria-invalid={Boolean(editorError)} aria-describedby={editorError ? 'calculator-cell-error' : 'calculator-function-hint'}
            aria-autocomplete="inline" autoComplete="off" spellCheck={false} value={state.source}
            onFocus={() => setEditorFocused(true)} onBlur={() => setEditorFocused(false)}
            onScroll={event => setEditorScroll(event.currentTarget.scrollLeft)}
            onSelect={event => setCaret(event.currentTarget.selectionStart === event.currentTarget.selectionEnd ? event.currentTarget.selectionStart ?? 0 : -1)}
            onChange={event => { dispatch({ type: 'source-changed', source: event.target.value }); setCaret(event.target.selectionStart ?? 0); setEditorError(null) }}
            onKeyDown={event => {
              if (event.nativeEvent.isComposing) return
              if (event.key === 'Escape') { event.preventDefault(); cancelCell(); return }
              if ((event.key === 'Tab' || event.key === 'ArrowRight') && completion && !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey) {
                event.preventDefault()
                const source = state.source.slice(0, completion.replaceFrom) + completion.insertion
                dispatch({ type: 'source-changed', source })
                setCaret(source.length)
                requestAnimationFrame(() => editorRef.current?.setSelectionRange(source.length, source.length))
                return
              }
              if (event.key === 'Enter' || event.key === 'Tab') {
                event.preventDefault()
                if (event.repeat) return
                const target = editTarget!
                const next = commitCell()
                if (!next) return
                const rows = target.grid === 'Equations' ? next.relations : variableRows(next.relations, next.variables)
                const savedRow = rows.findIndex(row => row.id === target.id)
                let row = savedRow < 0 ? Math.min(target.row, rows.length) : savedRow
                let column = target.column
                if (event.key === 'Enter') row = Math.max(0, Math.min(rows.length, row + (event.shiftKey ? -1 : 1)))
                else {
                  column += event.shiftKey ? -1 : 1
                  if (column < 0) { row = Math.max(0, row - 1); column = 2 }
                  if (column > 2) { row = Math.min(rows.length, row + 1); column = 0 }
                }
                requestAnimationFrame(() => focusCell({ grid: target.grid, row, column }))
              }
            }} />
        </div>
        {editorError && <p id="calculator-cell-error" role="alert" className="text-xs text-destructive">{editorError}</p>}
      </div>
    )
  }

  function editing(grid: GridName, id: string | null, column: number) {
    return editTarget?.grid === grid && editTarget.id === id && editTarget.column === column
  }

  function equationActions(equation: Relation, row: number) {
    return <DropdownMenu>
      <DropdownMenuTrigger render={<Button tabIndex={-1} variant="ghost" size="icon-sm" aria-label={`Actions for ${equation.source}`} />}><Ellipsis /></DropdownMenuTrigger>
      <DropdownMenuContent align="end" finalFocus={returnToCell}>
        <DropdownMenuItem onClick={() => startEdit(equationTarget(row))}><Pencil /> Edit</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={() => { if (editTarget?.id === equation.id) cancelCell(); dispatch({ type: 'delete', id: equation.id }) }}><Trash2 /> Delete</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  }

  function variableCells(variable: VariableRow, row: number): GridCell[] {
    const text = variable.values.map(value => value.exact).join('; ')
    const isEditingValue = editing('Variables', variable.id, 1)
    const valueContent = variable.values.length ? <span className="inline-flex items-center gap-2">
      {variable.locked && <LockKeyhole className="size-3 shrink-0" aria-hidden="true" />}
      {variable.values.map((value, index) => <span className="inline-flex items-center gap-1" key={index}>
        {variable.values.length > 1 && <span className="text-xs">{index + 1}:</span>}<MathExpression mathml={value.mathml} />
      </span>)}
    </span> : <span className="text-muted-foreground">{variable.source ? '—' : 'Enter value'}</span>
    return [
      { text: variable.name, readOnly: variable.generated || variable.locked,
        content: editing('Variables', variable.id, 0) ? cellEditor() : variable.name || <span className="text-muted-foreground">Optional name</span>,
        onActivate: () => startEdit(variableTarget(row, 0)), onType: text => startEdit(variableTarget(row, 0), text) },
      { text: isEditingValue ? state.source : text, title: variable.source || `Calculated from equations: ${text}`, readOnly: variable.locked && !isEditingValue,
        className: variable.locked && !isEditingValue ? 'calculator-computed-cell' : undefined,
        content: isEditingValue ? cellEditor() : <span title={variable.source || `Calculated from equations: ${text}`} className="block w-full">{valueContent}</span>,
        onActivate: () => startEdit(variableTarget(row, 1)), onType: text => startEdit(variableTarget(row, 1), text) },
      { text: variable.supplied ? 'Clear supplied value' : '', content: variable.supplied || (!variable.generated && !variable.locked) ? <DropdownMenu>
        <DropdownMenuTrigger render={<Button tabIndex={-1} variant="ghost" size="icon-sm" aria-label={`Actions for variable ${variable.name || row + 1}`} />}><Ellipsis /></DropdownMenuTrigger>
        <DropdownMenuContent align="end" finalFocus={returnToCell}>
          {variable.supplied && <DropdownMenuItem onClick={() => { if (editTarget?.id === variable.id) cancelCell(); dispatch({ type: 'variable-saved', variable: { id: variable.id, name: variable.name, source: '' } }) }}>Clear supplied value</DropdownMenuItem>}
          <DropdownMenuItem variant="destructive" onClick={() => { if (editTarget?.id === variable.id) cancelCell(); dispatch({ type: 'variable-deleted', id: variable.id }) }}><Trash2 /> Remove variable</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu> : null },
    ]
  }

  return (
    <section className="calculator-math mx-auto w-full max-w-[1600px] p-4 sm:p-6" ref={workspaceRef} aria-label="Scientific calculator workspace"
      onPointerDownCapture={() => { setPendingGroup(null); cancelAnimationFrame(shortcutFocusFrame.current) }}>
      <div className="grid min-w-0 gap-5">
        <section className="grid min-w-0 gap-3" aria-label="Equations section">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-medium">Equations</h2>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" aria-keyshortcuts="Control+o" onClick={() => setPicker('functions')}>Functions <Kbd>Ctrl O</Kbd></Button>
              <Button variant="outline" size="sm" aria-keyshortcuts="Control+e" onClick={() => setPicker('equations')}><BookOpen /> Equation library <Kbd>Ctrl E</Kbd></Button>
              <Button variant="ghost" size="icon-sm" aria-label="Calculator help" onClick={() => dispatch({ type: 'help-changed', open: true })}><CircleHelp /></Button>
            </div>
          </div>
          <CellGrid label="Equations" columns={['Equation', 'Use', 'Actions']} widths={['80%', '10%', '10%']}
            onActiveCellChange={(row, column) => selectCell({ grid: 'Equations', row, column })}
            rows={[
              ...state.relations.map((equation, row) => ({ id: equation.id, cells: [
                { text: equation.source, content: editing('Equations', equation.id, 0) ? cellEditor() : <MathExpression mathml={relationToMathMl(equation.ast)} />, onActivate: () => startEdit(equationTarget(row)), onType: (text: string) => startEdit(equationTarget(row), text) },
                { text: equation.enabled ? 'Yes' : 'No', content: <Checkbox tabIndex={-1} checked={equation.enabled} aria-label={`Enable ${equation.source}`} onCheckedChange={enabled => dispatch({ type: 'enabled-changed', id: equation.id, enabled })} />, onActivate: () => dispatch({ type: 'enabled-changed', id: equation.id, enabled: !equation.enabled }) },
                { text: 'Actions', content: equationActions(equation, row) },
              ] })),
              { id: 'new-equation', cells: [
                { text: '', content: editing('Equations', null, 0) ? cellEditor() : <span className="text-muted-foreground">Add an equation…</span>, onActivate: () => startEdit(equationTarget(state.relations.length)), onType: (text: string) => startEdit(equationTarget(state.relations.length), text) },
                { text: '' }, { text: '' },
              ] },
            ]} />
        </section>
        <section className="grid min-w-0 gap-3 border-t pt-4" aria-label="Variables section">
          <h2 className="text-sm font-medium">Variables <Kbd>Ctrl F</Kbd></h2>
          <CellGrid label="Variables" columns={['Variable', 'Value / expression', 'Actions']} widths={['25%', '65%', '10%']}
            onActiveCellChange={(row, column) => selectCell({ grid: 'Variables', row, column })}
            rows={[
              ...variables.map((variable, row) => ({ id: variable.id, cells: variableCells(variable, row) })),
              { id: 'new-variable', cells: [0, 1, 2].map(column => ({ text: '', content: editTarget?.grid === 'Variables' && !variables.some(variable => variable.id === editTarget.id) && editTarget.column === column ? cellEditor() : column < 2 ? <span className="text-muted-foreground">{column === 0 ? 'Optional name' : 'Add a value or expression…'}</span> : null,
                ...(column < 2 ? { onActivate: () => startEdit(variableTarget(variables.length, column)), onType: (text: string) => startEdit(variableTarget(variables.length, column), text) } : {}),
              })) },
            ]} />
          <p className="text-xs text-muted-foreground">Values update automatically. Hover to see the expression; Enter or double-click to edit. Grey values are solved and locked.</p>
          <p id="calculator-function-hint" className="text-xs text-muted-foreground" aria-live="polite">{completion ? `${completion.signature} · Tab or → to complete` : hint}</p>
          <ResultCard solver={state.solver} engine={engine} onRetry={() => { client.retry(); setRetryCount(count => count + 1) }} />
        </section>
      </div>
      <Dialog open={picker === 'functions'} onOpenChange={open => { if (!open) { setPicker(null); setPendingGroup(null) } }}>
        <DialogContent data-functions-picker finalFocus={returnToCell} className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Operators / functions</DialogTitle>
            <DialogDescription>{functionInsertionLocked ? 'Select an editable value or equation cell to insert a function.' : 'Choose a function to insert into the active cell.'}</DialogDescription>
          </DialogHeader>
          {OPERATION_GROUPS.map(group => (
            <FieldSet key={group.name} className="min-w-0 gap-2">
              <FieldLegend variant="label">{group.name} <Kbd>{group.shortcut.toUpperCase()}</Kbd></FieldLegend>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {group.items.map((item, index) => (
                  <Button key={item.id} ref={element => { if (index === 0) operationGroupRefs.current[group.shortcut] = element }}
                    variant="ghost" size="sm" className="h-11 min-w-0 justify-between gap-2 px-2"
                    aria-label={item.label} aria-description={`Keyboard shortcut: ${group.shortcut.toUpperCase()} then ${item.shortcut.toUpperCase()}`}
                    disabled={functionInsertionLocked}
                    onClick={() => insertOperation(item.template)}>
                    <OperationLabel item={item} />
                    <Kbd className="ml-auto shrink-0" aria-hidden="true">{item.shortcut.toUpperCase()}</Kbd>
                  </Button>
                ))}
              </div>
            </FieldSet>
          ))}
          <p className="text-xs text-muted-foreground" role="status">{pendingGroup ? `${pendingGroup.toUpperCase()} … Press an operation key.` : 'Choose a button, or press a group key followed by an operation key.'}</p>
        </DialogContent>
      </Dialog>

      <Dialog open={picker === 'equations'} onOpenChange={open => { if (!open) setPicker(null) }}>
        <DialogContent finalFocus={returnToCell} className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Equations</DialogTitle>
            <DialogDescription>Select equations or add a whole set to the Equations grid.</DialogDescription>
          </DialogHeader>
          <Button className="justify-self-start" size="sm" disabled={selectedEquations.size === 0} onClick={() => addLibraryEquations()}><Plus /> Add selected{selectedEquations.size > 0 ? ` (${selectedEquations.size})` : ''}</Button>
          <div className="grid min-w-0 gap-5">
            {LIBRARY_EQUATIONS.length === 0 ? (
              <p className="text-muted-foreground">No equations in the library yet.</p>
            ) : EQUATION_LIBRARY.map((file) => (
              <div key={file.file} className="grid min-w-0 gap-3">
                <h3 className="text-sm font-medium text-muted-foreground">{file.file}</h3>
                {file.groups.map((group, groupIndex) => (
                  <FieldSet key={groupIndex} className="min-w-0 gap-2">
                    <FieldLegend variant="label" className="w-full">
                      <span className="flex items-center justify-between gap-2">
                        <span>{group.title}</span>
                        <Button
                          size="sm"
                          variant="outline"
                          aria-label={`Add ${group.title} set from ${file.file}`}
                          onClick={() => addLibraryEquations(group.equations)}
                        >
                          <Plus /> Add set
                        </Button>
                      </span>
                    </FieldLegend>
                    {group.equations.map((equation, equationIndex) => (
                      <FieldLabel key={equationIndex}>
                        <Field orientation="horizontal">
                          <Checkbox
                            checked={selectedEquations.has(equation)}
                            aria-label={equation.source}
                            onCheckedChange={() => toggleEquation(equation)}
                          />
                          <MathExpression
                            className="min-w-0 py-1 text-base font-normal"
                            aria-hidden="true"
                            mathml={relationToMathMl(equation.ast)}
                          />
                        </Field>
                      </FieldLabel>
                    ))}
                  </FieldSet>
                ))}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={state.helpOpen}
        onOpenChange={(open) => dispatch({ type: 'help-changed', open })}
      >
        <DialogContent finalFocus={returnToCell} className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Calculator help</DialogTitle>
            <DialogDescription>Notation and V1 result states.</DialogDescription>
          </DialogHeader>
          <div dangerouslySetInnerHTML={{ __html: HELP_CONTENT_HTML }} />
        </DialogContent>
      </Dialog>
    </section>
  )
}
