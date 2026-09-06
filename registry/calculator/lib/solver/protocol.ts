import type { RelationAst } from '@/registry/calculator/lib/dsl/ast'

export type DisplayValue = {
  exact: string
  mathml: string
  approximate?: string
}

export type SolutionResult = {
  assignments: Record<string, DisplayValue>
  queries: DisplayValue[]
}

export type SolverResult =
  | {
      status: 'solved'
      variables: string[]
      solutions: SolutionResult[]
    }
  | { status: 'no-solution'; message: string }
  | { status: 'underdetermined'; symbols: string[]; message: string }
  | {
      status: 'overdefined'
      equationCount: number
      variableCount: number
      message: string
    }
  | { status: 'unresolved'; message: string; detail?: string }
  | { status: 'unsupported'; message: string; feature?: string }
  | { status: 'error'; message: string }

export type SolverMode = 'system' | 'symbolic'

export type SolverRequest = {
  type: 'solve'
  id: string
  relations: RelationAst[]
  mode: SolverMode
}

export type SolverWorkerMessage =
  | { type: 'ready' }
  | { type: 'init-error'; message: string }
  | { type: 'result'; id: string; result: SolverResult }
