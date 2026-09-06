import type { RelationAst } from '@/registry/calculator/lib/dsl/ast'
import { SOLVER_WORKER_SOURCE } from '@/registry/calculator/lib/generated/solver-worker-source'
import type {
  SolverRequest,
  SolverMode,
  SolverResult,
  SolverWorkerMessage,
} from '@/registry/calculator/lib/solver/protocol'

export type SolverEngineSnapshot =
  | { phase: 'idle' }
  | { phase: 'loading' }
  | { phase: 'ready' }
  | { phase: 'failed'; message: string }

export interface WorkerLike {
  onmessage: ((event: MessageEvent<SolverWorkerMessage>) => void) | null
  onerror: ((event: ErrorEvent) => void) | null
  postMessage(message: SolverRequest): void
  terminate(): void
}

export interface SolverClient {
  start(): void
  solve(relations: RelationAst[], mode?: SolverMode): Promise<SolverResult>
  getSnapshot(): SolverEngineSnapshot
  subscribe(listener: () => void): () => void
  retry(): void
  dispose(): void
}

type WorkerFactory = () => WorkerLike

type ActiveRequest = {
  request: SolverRequest
  resolve(result: SolverResult): void
  posted: boolean
}

const defaultWorkerFactory: WorkerFactory = () => {
  const workerUrl = URL.createObjectURL(
    new Blob([SOLVER_WORKER_SOURCE], { type: 'text/javascript' }),
  )
  const worker = new Worker(workerUrl, { type: 'module' })
  const terminate = worker.terminate.bind(worker)
  worker.terminate = () => {
    URL.revokeObjectURL(workerUrl)
    terminate()
  }
  return worker
}

export function createSolverClient(
  workerFactory: WorkerFactory = defaultWorkerFactory,
): SolverClient {
  let worker: WorkerLike | null = null
  let snapshot: SolverEngineSnapshot = { phase: 'idle' }
  let sequence = 0
  const listeners = new Set<() => void>()
  let queued: SolverRequest | null = null
  let active: ActiveRequest | null = null

  function publish(next: SolverEngineSnapshot): void {
    snapshot = next
    for (const listener of listeners) listener()
  }

  function settleActive(message: string): void {
    active?.resolve({ status: 'error', message })
    active = null
    queued = null
  }

  function handleMessage(
    source: WorkerLike,
    message: SolverWorkerMessage,
  ): void {
    if (source !== worker) return
    if (message.type === 'ready') {
      publish({ phase: 'ready' })
      if (queued && active?.request.id === queued.id) {
        active.posted = true
        source.postMessage(queued)
        queued = null
      }
      return
    }
    if (message.type === 'init-error') {
      publish({ phase: 'failed', message: message.message })
      settleActive(message.message)
      return
    }
    if (!active || active.request.id !== message.id) return
    const { resolve } = active
    active = null
    resolve(message.result)
  }

  function startWorker(): void {
    publish({ phase: 'loading' })
    try {
      const nextWorker = workerFactory()
      worker = nextWorker
      nextWorker.onmessage = (event) => handleMessage(nextWorker, event.data)
      nextWorker.onerror = (event) => {
        if (nextWorker !== worker) return
        const message = event.message || 'The solver worker stopped unexpectedly.'
        publish({ phase: 'failed', message })
        settleActive(message)
      }
    } catch (error) {
      worker = null
      const message =
        error instanceof Error ? error.message : 'The solver worker could not start.'
      publish({ phase: 'failed', message })
      settleActive(message)
    }
  }

  return {
    start() {
      if (!worker) startWorker()
    },
    solve(relations, mode = 'system') {
      if (active) {
        const restartWorker = active.posted
        settleActive('This calculation was superseded by a newer request.')
        if (restartWorker) {
          worker?.terminate()
          worker = null
        }
      }
      if (snapshot.phase === 'failed') {
        worker?.terminate()
        worker = null
      }
      const request: SolverRequest = {
        type: 'solve',
        id: `solve-${Date.now()}-${++sequence}`,
        relations,
        mode,
      }
      const promise = new Promise<SolverResult>((resolve) => {
        active = { request, resolve, posted: false }
      })
      if (!worker) startWorker()
      if (!active || active.request.id !== request.id) return promise
      if (worker && snapshot.phase === 'ready') {
        active.posted = true
        worker.postMessage(request)
      } else if (snapshot.phase !== 'failed') {
        queued = request
      }
      return promise
    },
    getSnapshot() {
      return snapshot
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    retry() {
      worker?.terminate()
      worker = null
      settleActive('The solver restarted before the calculation finished.')
      startWorker()
    },
    dispose() {
      worker?.terminate()
      worker = null
      settleActive('The solver was closed before the calculation finished.')
      publish({ phase: 'idle' })
      listeners.clear()
    },
  }
}
