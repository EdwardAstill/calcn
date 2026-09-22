import { AlertCircle, Info } from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'

import type { SolverState } from '@/registry/calculator/lib/model'
import type { SolverEngineSnapshot } from '@/registry/calculator/lib/solver/client'
import type { SolverResult } from '@/registry/calculator/lib/solver/protocol'

type ResultCardProps = {
  solver: SolverState
  engine: SolverEngineSnapshot
  onRetry(): void
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
      ? null
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
      <p className="text-sm text-muted-foreground">Add equations or variable values to begin.</p>
    )
  }

  return (
    <section className="grid gap-3" aria-label="Calculation result" aria-live="polite">
      {content}
    </section>
  )
}
