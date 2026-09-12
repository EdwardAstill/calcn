'use client'

import '@/registry/calculator/ui/math.css'

import { hasMatrixValues } from '@/registry/calculator/lib/dsl/ast'

import { completeFunction, functionHint } from '@/registry/calculator/lib/completion'
import { hasProbability } from '@/registry/calculator/lib/probability'
import {
  BookOpen,
  Calculator,
  ChartNoAxesColumn,
  CircleHelp,
  Ellipsis,
  Eraser,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react'
import {
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import {
  Field,
  FieldError,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@/components/ui/field'
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group'
import { Kbd } from '@/components/ui/kbd'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

import { CalculatorMathProvider, MathExpression } from '@/registry/calculator/ui/math'
import { OperationLabel } from '@/registry/calculator/ui/operation-label'
import { RelationPlot } from '@/registry/calculator/ui/relation-plot'
import { ResultCard } from '@/registry/calculator/ui/result-card'
import type { RelationAst } from '@/registry/calculator/lib/dsl/ast'
import { relationToMathMl } from '@/registry/calculator/lib/dsl/mathml'
import { parseRelation } from '@/registry/calculator/lib/dsl/parser'
import { HELP_CONTENT_HTML } from '@/registry/calculator/lib/generated/help-content'
import { EQUATION_LIBRARY } from '@/registry/calculator/lib/generated/equation-library'
import { initialCalculatorState } from '@/registry/calculator/lib/model'
import { applyInsertion, OPERATION_GROUPS } from '@/registry/calculator/lib/operations'
import { calculatorReducer } from '@/registry/calculator/lib/reducer'
import {
  createSolverClient,
  type SolverClient,
  type SolverEngineSnapshot,
} from '@/registry/calculator/lib/solver/client'
import { preflight } from '@/registry/calculator/lib/solver/preflight'
import type { SolverMode, SolverResult } from '@/registry/calculator/lib/solver/protocol'

type ScientificCalculatorProps = { solverClient?: SolverClient }

type EditorParseState =
  | { kind: 'empty' }
  | { kind: 'valid'; ast: RelationAst; mathml: string }
  | { kind: 'invalid'; message: string }

const IDLE_ENGINE: SolverEngineSnapshot = { phase: 'idle' }
const LIBRARY_EQUATIONS = EQUATION_LIBRARY.flatMap((file) =>
  file.groups.flatMap((group) => group.equations),
)

function parseEditor(source: string): EditorParseState {
  if (!source.trim()) return { kind: 'empty' }
  try {
    const ast = parseRelation(source)
    return { kind: 'valid', ast, mathml: relationToMathMl(ast) }
  } catch (error) {
    return {
      kind: 'invalid',
      message: error instanceof Error ? error.message : 'This expression is not valid.',
    }
  }
}

export function ScientificCalculator(props: ScientificCalculatorProps) {
  return (
    <CalculatorMathProvider>
      <CalculatorWorkspace {...props} />
    </CalculatorMathProvider>
  )
}

function CalculatorWorkspace({ solverClient }: ScientificCalculatorProps) {
  const client = useMemo(() => solverClient ?? createSolverClient(), [solverClient])
  const [state, dispatch] = useReducer(calculatorReducer, initialCalculatorState)
  const [activeTab, setActiveTab] = useState('calculator')
  const [operationGroup, setOperationGroup] = useState<string>(OPERATION_GROUPS[0].name)
  const [pendingGroup, setPendingGroup] = useState<string | null>(null)
  const calculatorTabRef = useRef<HTMLButtonElement>(null)
  const plotTabRef = useRef<HTMLButtonElement>(null)
  const relationsTabRef = useRef<HTMLButtonElement>(null)
  const operationTabRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const shortcutFocusFrame = useRef(0)
  const [relationsTab, setRelationsTab] = useState('relations')
  const [selectedEquations, setSelectedEquations] = useState<Set<typeof LIBRARY_EQUATIONS[number]>>(new Set())
  const libraryTabRef = useRef<HTMLButtonElement>(null)
  const editorRef = useRef<HTMLInputElement>(null)
  const focusEditorAfterMenu = useRef(false)
  const relationSequence = useRef(0)
  const requestSequence = useRef(0)
  const parsed = useMemo(() => parseEditor(state.source), [state.source])
  const [caret, setCaret] = useState(0)
  const [editorFocused, setEditorFocused] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [editorScroll, setEditorScroll] = useState(0)
  const completion = editorFocused && !dismissed ? completeFunction(state.source, caret) : null
  const hint = functionHint(state.source, caret)
  const [preview, setPreview] = useState('')
  const [editorError, setEditorError] = useState<string | null>(null)
  const engine = useSyncExternalStore(
    (listener) => client.subscribe(listener),
    () => client.getSnapshot(),
    () => IDLE_ENGINE,
  )

  useEffect(() => {
    setEditorError(null)
    if (parsed.kind === 'valid') setPreview(parsed.mathml)
    else if (parsed.kind === 'empty') setPreview('')
  }, [parsed])

  useEffect(() => {
    client.start()
    if (solverClient) return
    return () => client.dispose()
  }, [client, solverClient])

  useEffect(() => {
    let focusFrame = 0
    const focusEditor = () => {
      setActiveTab('calculator')
      dispatch({ type: 'help-changed', open: false })
      setRelationsTab('relations')
      cancelAnimationFrame(focusFrame)
      focusFrame = requestAnimationFrame(() => editorRef.current?.focus())
    }
    focusEditor()
    window.addEventListener('focus', focusEditor)
    return () => {
      cancelAnimationFrame(focusFrame)
      window.removeEventListener('focus', focusEditor)
      cancelAnimationFrame(shortcutFocusFrame.current)
    }
  }, [])

  function saveRelation() {
    if (parsed.kind !== 'valid') {
      setEditorError(parsed.kind === 'invalid' ? parsed.message : 'Enter an expression or equation first.')
      return
    }
    setEditorError(null)
    relationSequence.current += 1
    dispatch({
      type: 'save',
      id: `relation-${relationSequence.current}`,
      source: state.source.trim(),
      ast: parsed.ast,
      now: relationSequence.current,
    })
    queueMicrotask(() => editorRef.current?.focus())
  }

  function addLibraryEquations(equations = LIBRARY_EQUATIONS.filter((equation) => selectedEquations.has(equation))) {
    const relations = equations.map((equation) => {
      relationSequence.current += 1
      return {
        id: `relation-${relationSequence.current}`,
        source: equation.source,
        ast: equation.ast,
        createdAt: relationSequence.current,
        enabled: true,
      }
    })
    dispatch({ type: 'library-added', relations })
    setSelectedEquations(new Set())
    setRelationsTab('relations')
    requestAnimationFrame(() => relationsTabRef.current?.focus())
  }

  function insertOperation(template: string) {
    const editor = editorRef.current
    const insertion = applyInsertion(
      state.source,
      {
        start: editor?.selectionStart ?? state.source.length,
        end: editor?.selectionEnd ?? state.source.length,
      },
      template,
    )
    dispatch({ type: 'source-changed', source: insertion.source })
    cancelAnimationFrame(shortcutFocusFrame.current)
    shortcutFocusFrame.current = requestAnimationFrame(() => {
      editorRef.current?.focus()
      editorRef.current?.setSelectionRange(insertion.selection.start, insertion.selection.end)
    })
  }

  function handleShortcuts(event: KeyboardEvent) {
    if (event.isComposing || event.repeat) return
    const key = event.key.toLowerCase()
    const target = event.target as HTMLElement
    const editing = target.closest('input, textarea, select, [contenteditable="true"], [role="textbox"]')

    if (event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey && ['c', 'p', 'r', 'l'].includes(key)) {
      // Keep the familiar copy shortcut when text is selected.
      if (key === 'c' && (
        window.getSelection()?.toString() ||
        ((target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) && target.selectionStart !== target.selectionEnd)
      )) return
      event.preventDefault()
      event.stopPropagation()
      cancelAnimationFrame(shortcutFocusFrame.current)
      setPendingGroup(null)
      dispatch({ type: 'help-changed', open: false })
      if (key === 'c') setActiveTab('calculator')
      if (key === 'p') setActiveTab('plot')
      if (key === 'r') setRelationsTab('relations')
      if (key === 'l') setRelationsTab('library')
      shortcutFocusFrame.current = requestAnimationFrame(() => {
        const tab = key === 'c' ? calculatorTabRef.current
          : key === 'p' ? plotTabRef.current
          : key === 'l' ? libraryTabRef.current : relationsTabRef.current
        tab?.focus()
        tab?.scrollIntoView({ block: 'nearest' })
      })
      return
    }

    if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return
    if (key === 'escape') {
      event.preventDefault()
      event.stopPropagation()
      cancelAnimationFrame(shortcutFocusFrame.current)
      setPendingGroup(null)
      if (target === editorRef.current) {
        const group = OPERATION_GROUPS.find(group => group.name === operationGroup)!
        operationTabRefs.current[group.shortcut]?.focus()
      } else {
        setActiveTab('calculator')
        dispatch({ type: 'help-changed', open: false })
        setRelationsTab('relations')
        shortcutFocusFrame.current = requestAnimationFrame(() => editorRef.current?.focus())
      }
      return
    }
    if (editing || target.closest('[role="dialog"], [role="menu"]')) {
      if (pendingGroup) setPendingGroup(null)
      return
    }
    if (pendingGroup) {
      const group = OPERATION_GROUPS.find(group => group.shortcut === pendingGroup)!
      const item = group.items.find(item => item.shortcut === key)
      setPendingGroup(null)
      if (item) {
        event.preventDefault()
        event.stopPropagation()
        insertOperation(item.template)
      }
      return
    }
    const group = OPERATION_GROUPS.find(group => group.shortcut === key)
    if (group) {
      event.preventDefault()
      event.stopPropagation()
      setActiveTab('calculator')
      setOperationGroup(group.name)
      setPendingGroup(group.shortcut)
      cancelAnimationFrame(shortcutFocusFrame.current)
      shortcutFocusFrame.current = requestAnimationFrame(() => operationTabRefs.current[group.shortcut]?.focus())
    }
  }

  useEffect(() => {
    window.addEventListener('keydown', handleShortcuts, true)
    return () => window.removeEventListener('keydown', handleShortcuts, true)
  })

  async function solveRelations(
    relations: RelationAst[],
    mode: SolverMode = 'system',
  ) {
    if (mode === 'symbolic' && (hasProbability(relations) || hasMatrixValues([...relations, ...state.relations.filter(row => row.enabled).map(row => row.ast)]))) {
      relations = [...state.relations.filter(row => row.enabled && row.ast.kind === 'equation' && row.ast.left.kind === 'symbol' && !relations.includes(row.ast)).map(row => row.ast), ...relations]
    }
    if (relations.length === 0) {
      dispatch({
        type: 'local-diagnostic',
        code: 'no-relations',
        message: state.relations.length === 0
          ? 'Add an expression to the shared system first.'
          : 'Enable at least one relation first.',
      })
      return
    }

    requestSequence.current += 1
    const requestId = `calculation-${requestSequence.current}`
    dispatch({ type: 'solve-started', requestId })

    let result: SolverResult
    const validation = preflight(relations)
    if (!validation.ok) {
      result = {
        status: validation.status,
        equationCount: validation.equationCount,
        variableCount: validation.variableCount,
        message: validation.message,
      }
    } else {
      try {
        result = await client.solve(relations, mode)
      } catch (error) {
        result = {
          status: 'error',
          message: error instanceof Error ? error.message : 'The solver stopped unexpectedly.',
        }
      }
    }
    dispatch({ type: 'solve-finished', requestId, result })
  }

  function calculate() {
    return solveRelations(
      state.relations
        .filter((relation) => relation.enabled)
        .map((relation) => relation.ast),
    )
  }

  return (
    <section
      className="calculator-math mx-auto w-full max-w-7xl p-4 sm:p-6"
      aria-label="Scientific calculator workspace"
      onPointerDownCapture={() => { setPendingGroup(null); cancelAnimationFrame(shortcutFocusFrame.current) }}
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="min-w-0 gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <TabsList aria-label="Workspace tool">
              <TabsTrigger value="calculator" ref={calculatorTabRef} aria-label="Calculator" aria-keyshortcuts="Control+c">
                <Calculator /> Calculator <Kbd aria-hidden="true">Ctrl C</Kbd>
              </TabsTrigger>
              <TabsTrigger value="plot" ref={plotTabRef} aria-label="Plot" aria-keyshortcuts="Control+p">
                <ChartNoAxesColumn /> Plot <Kbd aria-hidden="true">Ctrl P</Kbd>
              </TabsTrigger>
            </TabsList>
            {state.editingId ? <Badge variant="secondary">Editing</Badge> : null}
            <Button
              className="ml-auto"
              variant="ghost"
              size="icon-sm"
              aria-label="Calculator help"
              onClick={() => dispatch({ type: 'help-changed', open: true })}
            >
              <CircleHelp />
            </Button>
          </div>

          <TabsContent value="calculator" className="grid content-start gap-4">
            <Field data-invalid={Boolean(editorError)}>
              <FieldLabel htmlFor="calculator-expression">Expression</FieldLabel>
              <div className="flex items-center gap-2">
                <InputGroup>
                  <div className="relative min-w-0 flex-1 font-mono text-base md:text-sm">
                    <div aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center pl-2.5 pr-1.5">
                      <div className="w-full overflow-hidden">
                        {completion && <span className="block whitespace-pre" style={{ transform: `translateX(-${editorScroll}px)` }}><span className="invisible">{state.source}</span><span className="text-muted-foreground/60">{completion.suffix}</span></span>}
                      </div>
                    </div>
                    <InputGroupInput
                      className="font-mono pr-1.5"
                      autoComplete="off"
                      spellCheck={false}
                      aria-autocomplete="inline"
                      aria-describedby="calculator-function-hint"
                      onFocus={() => setEditorFocused(true)}
                      onBlur={() => setEditorFocused(false)}
                      onSelect={event => { setCaret(event.currentTarget.selectionStart === event.currentTarget.selectionEnd ? event.currentTarget.selectionStart ?? 0 : -1) }}
                      onScroll={event => setEditorScroll(event.currentTarget.scrollLeft)}
                      ref={editorRef}
                      id="calculator-expression"
                      aria-label="Calculator expression"
                      value={state.source}
                      aria-invalid={Boolean(editorError)}
                      placeholder="2x + 3 = 7"
                      onChange={(event) => { dispatch({ type: 'source-changed', source: event.target.value }); setCaret(event.target.selectionStart ?? 0); setDismissed(false) }}
                      onKeyDown={(event) => {
                        if (event.nativeEvent.isComposing) return
                        if (event.key === 'Escape') setDismissed(true)
                        if ((event.key === 'Tab' || event.key === 'ArrowRight') && completion && !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey) {
                          event.preventDefault()
                          const source = state.source.slice(0, completion.replaceFrom) + completion.insertion
                          dispatch({ type: 'source-changed', source })
                          setCaret(source.length)
                          requestAnimationFrame(() => editorRef.current?.setSelectionRange(source.length, source.length))
                          return
                        }
                        if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                          event.preventDefault()
                          if (!event.repeat) saveRelation()
                        }
                      }}
                    />
                  </div>
                  <InputGroupAddon align="inline-end">
                    <InputGroupButton
                      size="icon-xs"
                      aria-label="Clear"
                      onClick={() => {
                        setEditorError(null)
                        dispatch({ type: 'clear-editor' })
                      }}
                      disabled={!state.source && !state.editingId && !editorError}
                    >
                      <Eraser />
                    </InputGroupButton>
                  </InputGroupAddon>
                </InputGroup>
                <Button
                  size="sm"
                  aria-label={state.editingId ? 'Save relation' : 'Add relation'}
                  onClick={saveRelation}
                >
                  <Plus /> {state.editingId ? 'Save' : 'Add'}
                </Button>
              </div>
              <p id="calculator-function-hint" className="min-h-4 text-xs text-muted-foreground" aria-live="polite">{completion ? `${completion.signature} · Tab or → to complete` : hint ?? 'Type a function for hints, including diff, Norm and P.'}</p>
              {editorError ? <FieldError>{editorError}</FieldError> : null}
            </Field>

            <div className="flex min-h-20 min-w-0 items-center justify-center rounded-md bg-muted/50 p-4" aria-label="Rendered math preview">
              <div className="max-w-full overflow-x-auto py-1 text-xl">
                {preview ? (
                  <MathExpression mathml={preview} />
                ) : (
                  <span className="text-sm text-muted-foreground">Your expression preview</span>
                )}
              </div>
            </div>

            <Tabs value={operationGroup} onValueChange={value => { setOperationGroup(value); setPendingGroup(null) }}>
              <div className="pb-1">
                <TabsList aria-label="Operations" className="max-w-full flex-wrap justify-start group-data-horizontal/tabs:h-auto" activateOnFocus={false}>
                  {OPERATION_GROUPS.map((group) => (
                    <TabsTrigger key={group.name} value={group.name} ref={element => { operationTabRefs.current[group.shortcut] = element }} aria-label={group.name} aria-keyshortcuts={group.shortcut}>
                      {group.name} <Kbd aria-hidden="true">{group.shortcut.toUpperCase()}</Kbd>
                    </TabsTrigger>
                  ))}
                </TabsList>
              </div>
              {OPERATION_GROUPS.map((group) => (
                <TabsContent key={group.name} value={group.name}>
                  <div className="grid grid-cols-4 gap-2">
                    {group.items.map((item) => (
                      <Button
                        key={item.id}
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-11 min-w-0 justify-between gap-2 px-2"
                        aria-label={item.label}
                        aria-description={`Keyboard shortcut: ${group.shortcut.toUpperCase()} then ${item.shortcut.toUpperCase()}`}
                        onClick={() => insertOperation(item.template)}
                      >
                        <OperationLabel item={item} />
                        <Kbd className="ml-auto shrink-0" aria-hidden="true">{item.shortcut.toUpperCase()}</Kbd>
                      </Button>
                    ))}
                  </div>
                </TabsContent>
              ))}
            </Tabs>
            <p className="text-xs text-muted-foreground" role="status">
              {pendingGroup ? `${pendingGroup.toUpperCase()} … Press an operation key, or Escape to return to the expression.` : 'Escape toggles between the expression and keyboard shortcuts.'}
            </p>
          </TabsContent>
          <TabsContent value="plot" className="min-w-0 overflow-hidden">
            {activeTab === 'plot' ? <RelationPlot relations={state.relations} /> : null}
          </TabsContent>
        </Tabs>

        <Separator className="hidden lg:block" orientation="vertical" />
        <Separator className="lg:hidden" />

        <Tabs
          value={relationsTab}
          onValueChange={setRelationsTab}
          className="min-w-0 gap-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <TabsList aria-label="Relations tools" activateOnFocus={false}>
              <TabsTrigger value="relations" ref={relationsTabRef} aria-label="Relations" aria-keyshortcuts="Control+r">Relations <Kbd aria-hidden="true">Ctrl R</Kbd></TabsTrigger>
              <TabsTrigger value="library" ref={libraryTabRef} aria-label="Library" aria-keyshortcuts="Control+l">
                <BookOpen /> Library <Kbd aria-hidden="true">Ctrl L</Kbd>
              </TabsTrigger>
            </TabsList>
            {relationsTab === 'relations' ? (
              <Button size="sm" onClick={() => void calculate()} disabled={state.solver.phase === 'loading'}>
                <Calculator /> Calculate
              </Button>
            ) : (
              <Button size="sm" disabled={selectedEquations.size === 0} onClick={() => addLibraryEquations()}>
                <Plus /> Add selected{selectedEquations.size > 0 ? ` (${selectedEquations.size})` : ''}
              </Button>
            )}
          </div>
          <TabsContent value="relations" className="grid content-start gap-4">
            <div className="divide-y rounded-lg border">
              {state.relations.length === 0 ? (
                <Empty>
                  <EmptyHeader>
                    <EmptyTitle>No relations yet</EmptyTitle>
                    <EmptyDescription>Add an expression or choose equations from the library.</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : state.relations.map((relation) => (
                <div className="flex items-center gap-3 px-3 py-2" data-testid="relation-row" key={relation.id}>
                  <Checkbox
                    checked={relation.enabled}
                    aria-label={`Enable ${relation.source}`}
                    onCheckedChange={(enabled) => dispatch({ type: 'enabled-changed', id: relation.id, enabled })}
                  />
                  <span
                    className={`min-w-0 flex-1 overflow-x-auto py-1 text-base ${relation.enabled ? '' : 'text-muted-foreground'}`}
                    aria-label={relation.source}
                  >
                    <MathExpression aria-hidden="true" mathml={relationToMathMl(relation.ast)} />
                  </span>
                  <DropdownMenu>
                    <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Actions for ${relation.source}`} />}>
                      <Ellipsis />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="end"
                      finalFocus={() => {
                        if (!focusEditorAfterMenu.current) return true
                        focusEditorAfterMenu.current = false
                        return editorRef.current
                      }}
                    >
                      <DropdownMenuItem
                        onClick={() => {
                          focusEditorAfterMenu.current = true
                          setActiveTab('calculator')
                          dispatch({ type: 'edit', id: relation.id })
                        }}
                      >
                        <Pencil /> Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={!relation.enabled || state.solver.phase === 'loading'}
                        onClick={() => void solveRelations([relation.ast], 'symbolic')}
                      >
                        <Calculator /> Solve
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem variant="destructive" onClick={() => dispatch({ type: 'delete', id: relation.id })}>
                        <Trash2 /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ))}
            </div>
            <Separator />
            <ResultCard solver={state.solver} engine={engine} onRetry={() => client.retry()} />
          </TabsContent>
          <TabsContent value="library" className="grid min-w-0 content-start gap-4">
            <p className="text-muted-foreground">Select individual equations or add a whole set to your relations.</p>
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
                              onCheckedChange={(checked) => setSelectedEquations((previous) => {
                                const next = new Set(previous)
                                if (checked) next.add(equation)
                                else next.delete(equation)
                                return next
                              })}
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
          </TabsContent>
        </Tabs>
      </div>

      <Dialog
        open={state.helpOpen}
        onOpenChange={(open) => dispatch({ type: 'help-changed', open })}
      >
        <DialogContent finalFocus={editorRef} className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
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
