import { afterEach, describe, expect, it, mock } from 'bun:test'
import { parseRelation } from '@/registry/calculator/lib/dsl/parser'
import type {
  SolverRequest,
  SolverResult,
  SolverWorkerMessage,
} from '@/registry/calculator/lib/solver/protocol'
import { createSolverClient, type WorkerLike } from '@/registry/calculator/lib/solver/client'

const solved: SolverResult = {
  status: 'solved',
  variables: ['x'],
  solutions: [
    {
      assignments: { x: { exact: '1', mathml: '<mn>1</mn>' } },
      queries: [],
    },
  ],
}

class FakeWorker implements WorkerLike {
  onmessage: ((event: MessageEvent<SolverWorkerMessage>) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  readonly posted: SolverRequest[] = []
  readonly terminate = mock()

  postMessage(message: SolverRequest): void {
    this.posted.push(message)
  }

  emit(message: SolverWorkerMessage): void {
    this.onmessage?.({ data: message } as MessageEvent<SolverWorkerMessage>)
  }
}

describe('createSolverClient', () => {
  const originalURL = globalThis.URL
  const originalWorker = globalThis.Worker
  afterEach(() => {
    globalThis.URL = originalURL
    globalThis.Worker = originalWorker
  })

  it('constructs the default worker from a generated module blob', async () => {
    const createObjectURL = mock(() => 'blob:calculator-solver')
    const revokeObjectURL = mock()
    const OriginalURL = globalThis.URL
    class StubURL extends OriginalURL {
      static createObjectURL = createObjectURL
      static revokeObjectURL = revokeObjectURL
    }
    const workerConstructor = mock()
    class BrowserWorker extends FakeWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super()
        workerConstructor(url, options)
      }
    }
    globalThis.URL = StubURL
    globalThis.Worker = BrowserWorker as unknown as typeof Worker

    const client = createSolverClient()
    const pending = client.solve([parseRelation('x=1')])

    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob))
    expect(workerConstructor).toHaveBeenCalledWith(
      'blob:calculator-solver',
      { type: 'module' },
    )
    expect(revokeObjectURL).not.toHaveBeenCalled()

    client.dispose()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:calculator-solver')
    await expect(pending).resolves.toMatchObject({ status: 'error' })
  })

  it('starts loading the Python worker before a solve request', () => {
    const worker = new FakeWorker()
    const client = createSolverClient(() => worker)

    client.start()

    expect(client.getSnapshot()).toEqual({ phase: 'loading' })
    expect(worker.posted).toHaveLength(0)
    worker.emit({ type: 'ready' })
    expect(client.getSnapshot()).toEqual({ phase: 'ready' })
  })

  it('queues while loading, correlates responses, and ignores unknown ids', async () => {
    const worker = new FakeWorker()
    const client = createSolverClient(() => worker)
    const pending = client.solve([parseRelation('x=1')], 'symbolic')

    expect(client.getSnapshot()).toEqual({ phase: 'loading' })
    expect(worker.posted).toHaveLength(0)

    worker.emit({ type: 'ready' })
    expect(worker.posted).toHaveLength(1)
    expect(worker.posted[0].relations[0].kind).toBe('equation')
    expect(worker.posted[0].mode).toBe('symbolic')

    worker.emit({
      type: 'result',
      id: 'stale',
      result: { status: 'no-solution', message: 'Wrong request.' },
    })
    worker.emit({ type: 'result', id: worker.posted[0].id, result: solved })

    await expect(pending).resolves.toEqual(solved)
  })

  it('exposes initialization failure and creates a fresh worker on retry', async () => {
    const failingWorker = new FakeWorker()
    const healthyWorker = new FakeWorker()
    const workers = [failingWorker, healthyWorker]
    const client = createSolverClient(() => {
      const worker = workers.shift()
      if (!worker) throw new Error('No worker available')
      return worker
    })
    const pending = client.solve([parseRelation('x=1')])

    failingWorker.emit({ type: 'init-error', message: 'Runtime unavailable.' })
    await expect(pending).resolves.toEqual({
      status: 'error',
      message: 'Runtime unavailable.',
    })
    expect(client.getSnapshot()).toEqual({
      phase: 'failed',
      message: 'Runtime unavailable.',
    })

    client.retry()

    expect(failingWorker.terminate).toHaveBeenCalledTimes(1)
    expect(client.getSnapshot()).toEqual({ phase: 'loading' })
    healthyWorker.emit({ type: 'ready' })
    expect(client.getSnapshot()).toEqual({ phase: 'ready' })
  })

  it('keeps only the newest request queued while the worker loads', async () => {
    const worker = new FakeWorker()
    const client = createSolverClient(() => worker)
    const first = client.solve([parseRelation('x=1')])
    const second = client.solve([parseRelation('x=2')])

    await expect(first).resolves.toEqual({
      status: 'error',
      message: 'This calculation was superseded by a newer request.',
    })
    expect(worker.terminate).not.toHaveBeenCalled()

    worker.emit({ type: 'ready' })
    expect(worker.posted).toHaveLength(1)
    expect(worker.posted[0].relations).toEqual([parseRelation('x=2')])
    worker.emit({ type: 'result', id: worker.posted[0].id, result: solved })
    await expect(second).resolves.toEqual(solved)
  })

  it('restarts the worker when a new request supersedes active work', async () => {
    const firstWorker = new FakeWorker()
    const secondWorker = new FakeWorker()
    const workers = [firstWorker, secondWorker]
    const client = createSolverClient(() => {
      const worker = workers.shift()
      if (!worker) throw new Error('No worker available')
      return worker
    })

    const first = client.solve([parseRelation('x=1')])
    firstWorker.emit({ type: 'ready' })
    expect(firstWorker.posted).toHaveLength(1)

    const second = client.solve([parseRelation('x=2')])
    await expect(first).resolves.toEqual({
      status: 'error',
      message: 'This calculation was superseded by a newer request.',
    })
    expect(firstWorker.terminate).toHaveBeenCalledTimes(1)
    expect(client.getSnapshot()).toEqual({ phase: 'loading' })

    secondWorker.emit({ type: 'ready' })
    expect(secondWorker.posted).toHaveLength(1)
    expect(secondWorker.posted[0].relations).toEqual([parseRelation('x=2')])
    secondWorker.emit({
      type: 'result',
      id: secondWorker.posted[0].id,
      result: solved,
    })
    await expect(second).resolves.toEqual(solved)
  })

  it('terminates the worker and settles pending work on disposal', async () => {
    const worker = new FakeWorker()
    const client = createSolverClient(() => worker)
    const pending = client.solve([parseRelation('x=1')])

    client.dispose()

    expect(worker.terminate).toHaveBeenCalledTimes(1)
    await expect(pending).resolves.toEqual({
      status: 'error',
      message: 'The solver was closed before the calculation finished.',
    })
    expect(client.getSnapshot()).toEqual({ phase: 'idle' })
  })

  it('settles the request when the worker cannot be constructed', async () => {
    const client = createSolverClient(() => {
      throw new Error('Worker construction failed.')
    })

    const pending = client.solve([parseRelation('x=1')])

    await expect(pending).resolves.toEqual({
      status: 'error',
      message: 'Worker construction failed.',
    })
    expect(client.getSnapshot()).toEqual({
      phase: 'failed',
      message: 'Worker construction failed.',
    })
  })
})
