import { collectEquationSymbols, collectFreeSymbols } from '@/registry/calculator/lib/dsl/analyze'
import { parseRelation } from '@/registry/calculator/lib/dsl/parser'
import type { RelationAst } from '@/registry/calculator/lib/dsl/ast'
import type { Relation, VariableInput } from '@/registry/calculator/lib/model'
import type { DisplayValue, SolverResult } from '@/registry/calculator/lib/solver/protocol'

export type VariableRow = VariableInput & {
  supplied: boolean
  generated: boolean
  locked: boolean
  values: DisplayValue[]
}

export function parseVariable(name: string, source: string): Pick<VariableInput, 'name' | 'source'> {
  name = name.trim()
  source = source.trim()
  if (name) {
    const parsed = parseRelation(name)
    if (parsed.kind !== 'query' || parsed.expression.kind !== 'symbol') {
      throw new Error('Use a variable name such as x or mass.')
    }
    name = name.toLowerCase()
  }
  if (source && parseRelation(source).kind !== 'query') {
    throw new Error('Enter a value or expression here. Put equations in the Equations grid.')
  }
  return { name, source }
}

export function workspaceRelations(equations: Relation[], variables: VariableInput[]): RelationAst[] {
  return [
    ...equations.filter(equation => equation.enabled).map(equation => equation.ast),
    ...variables.filter(variable => variable.source.trim()).map(variable =>
      parseRelation(variable.name ? `${variable.name} = ${variable.source}` : variable.source)),
  ]
}

export function variableRows(equations: Relation[], variables: VariableInput[], result?: SolverResult): VariableRow[] {
  const names = new Set(collectEquationSymbols(equations.filter(row => row.enabled).map(row => row.ast)))
  for (const variable of variables) {
    if (variable.name) names.add(variable.name)
    if (variable.source) {
      const ast = parseRelation(variable.source)
      if (ast.kind === 'query') for (const symbol of collectFreeSymbols(ast.expression)) names.add(symbol)
    }
  }
  const solutions = result?.status === 'solved' ? result.solutions : []
  const rows = [...names].map(name => {
    const input = variables.find(variable => variable.name === name)
    const supplied = Boolean(input?.source.trim())
    const values = solutions.map(solution => Object.hasOwn(solution.assignments, name) ? solution.assignments[name] : undefined).filter((value): value is DisplayValue => Boolean(value))
    return {
      id: input?.id ?? `symbol-${name}`, name, source: input?.source ?? '',
      supplied, generated: !input, locked: !supplied && values.length > 0 && values.length === solutions.length,
      values,
    }
  })
  let queryIndex = 0
  for (const input of variables.filter(variable => !variable.name)) {
    const values = input.source ? solutions.map(solution => solution.queries[queryIndex]).filter((value): value is DisplayValue => Boolean(value)) : []
    if (input.source) queryIndex++
    rows.push({ ...input, supplied: Boolean(input.source), generated: false, locked: false, values })
  }
  return rows
}
