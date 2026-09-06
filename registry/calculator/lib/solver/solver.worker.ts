import type { PyodideAPI } from 'pyodide'
import { SOLVER_SOURCE } from '@/registry/calculator/lib/generated/solver-source'
import type { SolverRequest, SolverWorkerMessage } from '@/registry/calculator/lib/solver/protocol'

type WorkerScope = {
  onmessage: ((event: MessageEvent<SolverRequest>) => void) | null
  postMessage(message: SolverWorkerMessage): void
}

const workerScope = globalThis as unknown as WorkerScope
const PYODIDE_INDEX_URL =
  'https://cdn.jsdelivr.net/pyodide/v314.0.6/full/'

async function initialize(): Promise<PyodideAPI> {
  try {
    const pyodideModule = (await import(
      /* @vite-ignore */ /* webpackIgnore: true */ `${PYODIDE_INDEX_URL}pyodide.mjs`
    )) as typeof import('pyodide')
    const pyodide = await pyodideModule.loadPyodide({
      indexURL: PYODIDE_INDEX_URL,
    })
    await pyodide.loadPackage('sympy')
    pyodide.FS.writeFile('calculator_solver.py', SOLVER_SOURCE)
    await pyodide.runPythonAsync('from calculator_solver import solve_payload')
    workerScope.postMessage({ type: 'ready' })
    return pyodide
  } catch (error) {
    workerScope.postMessage({
      type: 'init-error',
      message:
        error instanceof Error
          ? `The Python solver could not start: ${error.message}`
          : 'The Python solver could not start.',
    })
    throw error
  }
}

const pyodidePromise = initialize()
let calculationQueue = Promise.resolve()

async function solve(request: SolverRequest): Promise<void> {
  try {
    const pyodide = await pyodidePromise
    pyodide.globals.set(
      '_calculator_payload_json',
      JSON.stringify({ mode: request.mode, relations: request.relations }),
    )
    try {
      const resultJson = await pyodide.runPythonAsync(`
import json
json.dumps(solve_payload(json.loads(_calculator_payload_json)))
`)
      workerScope.postMessage({
        type: 'result',
        id: request.id,
        result: JSON.parse(String(resultJson)),
      })
    } finally {
      pyodide.globals.delete('_calculator_payload_json')
    }
  } catch (error) {
    workerScope.postMessage({
      type: 'result',
      id: request.id,
      result: {
        status: 'error',
        message:
          error instanceof Error
            ? `Solver error: ${error.message}`
            : 'The solver stopped unexpectedly.',
      },
    })
  }
}

workerScope.onmessage = (event) => {
  calculationQueue = calculationQueue.then(() => solve(event.data))
}
