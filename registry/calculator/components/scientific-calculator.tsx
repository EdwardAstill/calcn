'use client'

import {
  Calculator,
  ChartNoAxesColumn,
  CircleHelp,
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

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
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
  Field,
  FieldError,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

import { RelationPlot } from '@/registry/calculator/ui/relation-plot'
import { ResultCard } from '@/registry/calculator/ui/result-card'
import type { RelationAst } from '@/registry/calculator/lib/dsl/ast'
import { relationToMathMl } from '@/registry/calculator/lib/dsl/mathml'
import { parseRelation } from '@/registry/calculator/lib/dsl/parser'
import { HELP_CONTENT_HTML } from '@/registry/calculator/lib/generated/help-content'
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
  const editorRef = useRef<HTMLInputElement>(null)
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
      className="w-full p-4"
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
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Calculator help"
              onClick={() => dispatch({ type: 'help-changed', open: true })}
            >
              <CircleHelp />
            </Button>
            {state.editingId ? <Badge>Editing</Badge> : null}
          </div>

          <TabsContent value="calculator" className="grid content-start gap-4">
            <Field data-invalid={Boolean(editorError)}>
              <FieldLabel htmlFor="calculator-expression">Calculator expression</FieldLabel>
              <div className="flex items-center gap-2">
                <Input
                  ref={editorRef}
                  id="calculator-expression"
                  className="h-8"
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
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label="Clear"
                  onClick={() => {
                    setEditorError(null)
                    dispatch({ type: 'clear-editor' })
                  }}
                  disabled={!state.source && !state.editingId && !editorError}
                >
                  <Eraser />
                </Button>
                <Button
                  size="icon-sm"
                  aria-label={state.editingId ? 'Save relation' : 'Add relation'}
                  onClick={saveRelation}
                >
                  <Plus />
                </Button>
              </div>
              {editorError ? <FieldError>{editorError}</FieldError> : null}
            </Field>

            <Alert className="min-w-0 place-items-center text-center" aria-label="Rendered math preview">
              <AlertDescription className="max-w-full overflow-x-auto">
                {preview ? (
                  <span dangerouslySetInnerHTML={{ __html: preview }} />
                ) : (
                  <span aria-hidden="true">&nbsp;</span>
                )}
              </AlertDescription>
            </Alert>

            <Separator />

            <Tabs defaultValue={OPERATION_GROUPS[0].name}>
              <TabsList>
                {OPERATION_GROUPS.map((group) => (
                  <TabsTrigger key={group.name} value={group.name}>{group.name}</TabsTrigger>
                ))}
              </TabsList>
              {OPERATION_GROUPS.map((group) => (
                <TabsContent key={group.name} value={group.name}>
                  <div className="flex flex-wrap gap-2">
                    {group.items.map((item) => (
                      <Button
                        key={item.id}
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => insertOperation(item.template)}
                      >
                        {item.label}
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

        <section className="flex min-h-[32rem] flex-col gap-4">
          <TooltipProvider>
            <div className="grid gap-3">
              {state.relations.length === 0 ? (
              <Alert>
                <AlertTitle>No relations yet</AlertTitle>
                <AlertDescription>Add an expression from the editor.</AlertDescription>
              </Alert>
              ) : state.relations.map((relation, index) => (
              <div className="grid gap-3" key={relation.id}>
                <div className="flex items-center gap-3" data-testid="relation-row">
                  <Checkbox
                    checked={relation.enabled}
                    aria-label={`Enable ${relation.source}`}
                    onCheckedChange={(enabled) => {
                      dispatch({ type: 'enabled-changed', id: relation.id, enabled })
                    }}
                  />
                  <span className="min-w-0 flex-1" aria-label={relation.source}>
                    <span
                      aria-hidden="true"
                      dangerouslySetInnerHTML={{ __html: relationToMathMl(relation.ast) }}
                    />
                  </span>
                  <Tooltip>
                    <TooltipTrigger
                      render={(
                        <Button
                          size="icon-sm"
                          aria-label={`Solve ${relation.source}`}
                          disabled={!relation.enabled || state.solver.phase === 'loading'}
                          onClick={() => void solveRelations([relation.ast], 'symbolic')}
                        >
                          <Calculator />
                        </Button>
                      )}
                    />
                    <TooltipContent>Solve</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger
                      render={(
                        <Button
                          variant="outline"
                          size="icon-sm"
                          aria-label={`Edit ${relation.source}`}
                          onClick={() => {
                            setActiveTab('calculator')
                            dispatch({ type: 'edit', id: relation.id })
                            queueMicrotask(() => editorRef.current?.focus())
                          }}
                        >
                          <Pencil />
                        </Button>
                      )}
                    />
                    <TooltipContent>Edit</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger
                      render={(
                        <Button
                          variant="destructive"
                          size="icon-sm"
                          aria-label={`Delete ${relation.source}`}
                          onClick={() => dispatch({ type: 'delete', id: relation.id })}
                        >
                          <Trash2 />
                        </Button>
                      )}
                    />
                    <TooltipContent>Delete</TooltipContent>
                  </Tooltip>
                </div>
                {index < state.relations.length - 1 ? <Separator /> : null}
              </div>
              ))}
            </div>
          </TooltipProvider>
          <div>
            <Button size="sm" onClick={() => void calculate()} disabled={state.solver.phase === 'loading'}>
              <Calculator /> Calculate
            </Button>
          </div>
          <div className="mt-auto grid gap-4">
            <Separator />
            <ResultCard solver={state.solver} engine={engine} onRetry={() => client.retry()} />
          </div>
        </section>
      </div>

      <Dialog
        open={state.helpOpen}
        onOpenChange={(open) => dispatch({ type: 'help-changed', open })}
      >
        <DialogContent finalFocus={editorRef}>
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
