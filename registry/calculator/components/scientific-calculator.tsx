'use client'

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
  DialogFooter,
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
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

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

export function ScientificCalculator({ solverClient }: ScientificCalculatorProps) {
  const client = useMemo(() => solverClient ?? createSolverClient(), [solverClient])
  const [state, dispatch] = useReducer(calculatorReducer, initialCalculatorState)
  const [activeTab, setActiveTab] = useState('calculator')
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [selectedEquations, setSelectedEquations] = useState<Set<typeof LIBRARY_EQUATIONS[number]>>(new Set())
  const libraryTabRef = useRef<HTMLButtonElement>(null)
  const editorRef = useRef<HTMLInputElement>(null)
  const focusEditorAfterMenu = useRef(false)
  const relationSequence = useRef(0)
  const requestSequence = useRef(0)
  const parsed = useMemo(() => parseEditor(state.source), [state.source])
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
      setLibraryOpen(false)
      cancelAnimationFrame(focusFrame)
      focusFrame = requestAnimationFrame(() => editorRef.current?.focus())
    }
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.isComposing) return
      event.preventDefault()
      focusEditor()
    }
    focusEditor()
    window.addEventListener('focus', focusEditor)
    window.addEventListener('keydown', onEscape, true)
    return () => {
      cancelAnimationFrame(focusFrame)
      window.removeEventListener('focus', focusEditor)
      window.removeEventListener('keydown', onEscape, true)
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

  function addLibraryEquations() {
    const relations = LIBRARY_EQUATIONS
      .filter((equation) => selectedEquations.has(equation))
      .map((equation) => {
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
    setLibraryOpen(false)
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
    queueMicrotask(() => {
      editorRef.current?.focus()
      editorRef.current?.setSelectionRange(insertion.selection.start, insertion.selection.end)
    })
  }

  async function solveRelations(
    relations: RelationAst[],
    mode: SolverMode = 'system',
  ) {
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
      className="mx-auto w-full max-w-7xl p-4 sm:p-6"
      aria-label="Scientific calculator workspace"
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="min-w-0 gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <TabsList aria-label="Workspace tool">
              <TabsTrigger value="calculator">
                <Calculator /> Calculator
              </TabsTrigger>
              <TabsTrigger value="plot">
                <ChartNoAxesColumn /> Plot
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
                  <InputGroupInput
                    ref={editorRef}
                    id="calculator-expression"
                    aria-label="Calculator expression"
                    value={state.source}
                    aria-invalid={Boolean(editorError)}
                    placeholder="2x + 3 = 7"
                    onChange={(event) => dispatch({ type: 'source-changed', source: event.target.value })}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                        event.preventDefault()
                        if (!event.repeat) saveRelation()
                      }
                    }}
                  />
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
              {editorError ? <FieldError>{editorError}</FieldError> : null}
            </Field>

            <div className="flex min-h-20 min-w-0 items-center justify-center rounded-md bg-muted/50 p-4" aria-label="Rendered math preview">
              <div className="max-w-full overflow-x-auto text-base">
                {preview ? (
                  <span dangerouslySetInnerHTML={{ __html: preview }} />
                ) : (
                  <span className="text-sm text-muted-foreground">Your expression preview</span>
                )}
              </div>
            </div>

            <Tabs defaultValue={OPERATION_GROUPS[0].name}>
              <div className="overflow-x-auto pb-1">
                <TabsList variant="line" aria-label="Operations">
                  {OPERATION_GROUPS.map((group) => (
                    <TabsTrigger key={group.name} value={group.name}>{group.name}</TabsTrigger>
                  ))}
                </TabsList>
              </div>
              {OPERATION_GROUPS.map((group) => (
                <TabsContent key={group.name} value={group.name}>
                  <div className={`grid gap-2 ${group.items.length <= 3 ? 'grid-cols-3' : 'grid-cols-4'}`}>
                    {group.items.map((item) => (
                      <Button
                        key={item.id}
                        type="button"
                        variant="outline"
                        size="sm"
                        aria-label={item.label}
                        onClick={() => insertOperation(item.template)}
                      >
                        <OperationLabel item={item} />
                      </Button>
                    ))}
                  </div>
                </TabsContent>
              ))}
            </Tabs>
          </TabsContent>
          <TabsContent value="plot" className="min-w-0 overflow-hidden">
            {activeTab === 'plot' ? <RelationPlot relations={state.relations} /> : null}
          </TabsContent>
        </Tabs>

        <Separator className="hidden lg:block" orientation="vertical" />
        <Separator className="lg:hidden" />

        <Tabs
          value="relations"
          onValueChange={(value) => {
            if (value === 'library') {
              setSelectedEquations(new Set())
              setLibraryOpen(true)
            }
          }}
          className="min-w-0 gap-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <TabsList aria-label="Relations tools" activateOnFocus={false}>
              <TabsTrigger value="relations">Relations</TabsTrigger>
              <TabsTrigger value="library" ref={libraryTabRef} aria-haspopup="dialog">
                <BookOpen /> Library
              </TabsTrigger>
            </TabsList>
            <Button size="sm" onClick={() => void calculate()} disabled={state.solver.phase === 'loading'}>
              <Calculator /> Calculate
            </Button>
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
                    <span aria-hidden="true" dangerouslySetInnerHTML={{ __html: relationToMathMl(relation.ast) }} />
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
        </Tabs>
      </div>

      <Dialog open={libraryOpen} onOpenChange={setLibraryOpen}>
        <DialogContent finalFocus={libraryTabRef} className="max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Equation library</DialogTitle>
            <DialogDescription>Select equations to add to your relations.</DialogDescription>
          </DialogHeader>
          <div className="grid max-h-[60dvh] min-h-0 gap-5 overflow-y-auto">
            {LIBRARY_EQUATIONS.length === 0 ? (
              <p className="text-muted-foreground">No equations in the library yet.</p>
            ) : EQUATION_LIBRARY.map((file) => (
              <div key={file.file} className="grid gap-3">
                <h3 className="text-sm font-medium text-muted-foreground">{file.file}</h3>
                {file.groups.map((group, groupIndex) => (
                  <FieldSet key={groupIndex} className="min-w-0 gap-2">
                    <FieldLegend variant="label">{group.title}</FieldLegend>
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
                          <span
                            className="min-w-0 overflow-x-auto text-base font-normal"
                            aria-hidden="true"
                            dangerouslySetInnerHTML={{ __html: relationToMathMl(equation.ast) }}
                          />
                        </Field>
                      </FieldLabel>
                    ))}
                  </FieldSet>
                ))}
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLibraryOpen(false)}>Cancel</Button>
            <Button disabled={selectedEquations.size === 0} onClick={addLibraryEquations}>
              <Plus /> Add selected{selectedEquations.size > 0 ? ` (${selectedEquations.size})` : ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
