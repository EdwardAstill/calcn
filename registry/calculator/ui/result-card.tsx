import { AlertCircle, CheckCircle2, Info } from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'

import type { SolverState } from '@/registry/calculator/lib/model'
import { toMathMl } from '@/registry/calculator/lib/dsl/mathml'
import type { SolverEngineSnapshot } from '@/registry/calculator/lib/solver/client'
import type { DisplayValue, SolverResult } from '@/registry/calculator/lib/solver/protocol'

type ResultCardProps = {
  solver: SolverState
  engine: SolverEngineSnapshot
  onRetry(): void
}

function Value({ value }: { value: DisplayValue }) {
  return (
    <span className="inline-flex flex-wrap items-center justify-end gap-2 text-base">
      <span
        aria-hidden="true"
        dangerouslySetInnerHTML={{
          __html: `<math xmlns="http://www.w3.org/1998/Math/MathML">${value.mathml}</math>`,
        }}
      />
      <code className="sr-only">{value.exact}</code>
      {value.approximate ? (
        <span className="text-muted-foreground">
          {'≈ '}
          <span dangerouslySetInnerHTML={{ __html: toMathMl({ kind: 'number', value: value.approximate }) }} />
        </span>
      ) : null}
    </span>
  )
}

function Solved({ result }: { result: Extract<SolverResult, { status: 'solved' }> }) {
  return (
    <div className="grid gap-3">
      <Alert>
        <CheckCircle2 />
        <AlertTitle>Solved over the reals</AlertTitle>
        <AlertDescription>
          {result.solutions.length}{' '}
          {result.solutions.length === 1 ? 'solution' : 'solutions'} found.
        </AlertDescription>
      </Alert>
      {result.solutions.map((solution, index) => (
        <section className="grid gap-2" key={`solution-${index + 1}`}>
          <h3 className="text-sm font-medium">Solution {index + 1}</h3>
          <dl className="grid gap-2">
            {Object.entries(solution.assignments).map(([name, value]) => (
              <div className="flex items-center justify-between gap-4" key={name}>
                <dt className="text-base" aria-label={name}>
                  <span aria-hidden="true" dangerouslySetInnerHTML={{ __html: toMathMl({ kind: 'symbol', name }) }} />
                </dt>
                <dd className="min-w-0 overflow-x-auto"><Value value={value} /></dd>
              </div>
            ))}
            {solution.queries.map((value, queryIndex) => (
              <div className="flex items-center justify-between gap-4" key={`query-${queryIndex + 1}`}>
                <dt>Query {queryIndex + 1}</dt>
                <dd className="min-w-0 overflow-x-auto"><Value value={value} /></dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  )
}

function Diagnostic({
  result,
  onRetry,
}: {
  result: Exclude<SolverResult, { status: 'solved' }>
  onRetry(): void
}) {
  return (
    <Alert variant={result.status === 'error' ? 'destructive' : 'default'}>
      <AlertCircle />
      <AlertTitle>{result.status.replaceAll('-', ' ')}</AlertTitle>
      <AlertDescription>{result.message}</AlertDescription>
      {result.status === 'error' ? (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Retry Python engine
        </Button>
      ) : null}
    </Alert>
  )
}

export function ResultCard({ solver, engine, onRetry }: ResultCardProps) {
  let content

  if (solver.phase === 'loading') {
    content = (
      <Alert>
        <Spinner />
        <AlertTitle>
          {engine.phase === 'loading' ? 'Preparing Python engine' : 'Calculating'}
        </AlertTitle>
        <AlertDescription>The first calculation may take a moment.</AlertDescription>
      </Alert>
    )
  } else if (solver.phase === 'diagnostic') {
    content = (
      <Alert>
        <Info />
        <AlertTitle>Add a relation first</AlertTitle>
        <AlertDescription>{solver.message}</AlertDescription>
      </Alert>
    )
  } else if (solver.phase === 'complete') {
    content = solver.result.status === 'solved'
      ? <Solved result={solver.result} />
      : <Diagnostic result={solver.result} onRetry={onRetry} />
  } else if (engine.phase === 'failed') {
    content = (
      <Diagnostic
        result={{ status: 'error', message: engine.message }}
        onRetry={onRetry}
      />
    )
  } else {
    content = (
      <p className="text-sm text-muted-foreground">Select relations and calculate to see results.</p>
    )
  }

  return (
    <section className="grid gap-3" aria-label="Calculation result" aria-live="polite">
      {content}
    </section>
  )
}
