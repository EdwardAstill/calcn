import type { ComparisonOperator, ExpressionAst, RelationAst } from '@/registry/calculator/lib/dsl/ast'
import { toMathMl } from '@/registry/calculator/lib/dsl/mathml'
import { toLatex } from '@/registry/calculator/lib/dsl/latex'
import { distribution, isDistribution, type Distribution } from '@/registry/calculator/lib/distributions'
import type { DisplayValue, SolverResult } from '@/registry/calculator/lib/solver/protocol'

type RandomValue = { distribution: Distribution; identity: object; scale: number; shift: number }
type Value = number | RandomValue
const probabilityCalls = new Set(['P', 'E', 'Var', 'quantile'])
export function containsProbability(node: ExpressionAst): boolean {
  switch (node.kind) {
    case 'array': return node.items.some(containsProbability)
    case 'call': return isDistribution(node.name) || probabilityCalls.has(node.name) || node.args.some(containsProbability)
    case 'binary': return containsProbability(node.left) || containsProbability(node.right)
    case 'unary': case 'factorial': return containsProbability(node.operand)
    case 'comparison': return node.operands.some(containsProbability)
    default: return false
  }
}
export function hasProbability(relations: readonly RelationAst[]): boolean {
  return relations.some(row => row.kind === 'query' ? containsProbability(row.expression) : containsProbability(row.left) || containsProbability(row.right))
}
function numeric(value: Value): number {
  if (typeof value !== 'number') throw new Error('Use P, E, Var or quantile to obtain a number from a random variable.')
  if (!Number.isFinite(value)) throw new Error('This probability calculation requires finite numeric values.')
  return value
}
function random(value: Value): RandomValue {
  if (typeof value === 'number') throw new Error('Expected a random variable or distribution.')
  return value
}
function affine(value: RandomValue, scale: number, shift: number): Value {
  const result = { ...value, scale: value.scale * scale, shift: value.shift * scale + shift }
  return result.scale === 0 ? result.shift : result
}
function subtract(left: Value, right: Value): Value {
  if (typeof left === 'number') return typeof right === 'number' ? left - right : affine(right, -1, left)
  if (typeof right === 'number') return affine(left, 1, -right)
  if (left.identity !== right.identity) throw new Error('Combining different random variables requires a dependence model; this version supports one random variable per event.')
  const scale = left.scale - right.scale, shift = left.shift - right.shift
  return scale === 0 ? shift : { ...left, scale, shift }
}
const compare = (a: number, op: ComparisonOperator, b: number) => {
  switch (op) { case '<': return a < b; case '<=': return a <= b; case '>': return a > b; case '>=': return a >= b; case '=': return a === b; case '!=': return a !== b }
}
export type ProbabilityEvent = { random: RandomValue | null; probability: number; includes(x: number): boolean; boundaries: number[] }

export function probabilityContext(relations: readonly RelationAst[]) {
  const definitions = new Map<string, ExpressionAst[]>()
  for (const row of relations) if (row.kind === 'equation' && row.left.kind === 'symbol') {
    const name = row.left.name.toLowerCase()
    definitions.set(name, [...definitions.get(name) ?? [], row.right])
  }
  const cache = new Map<string, Value>(), resolving = new Set<string>()
  function resolve(name: string): Value {
    name = name.toLowerCase()
    if (cache.has(name)) return cache.get(name)!
    const rows = definitions.get(name)
    if (!rows) throw new Error(`Define ${name} before using it in a probability calculation.`)
    if (rows.length !== 1) throw new Error(`Probability calculations require one definition for ${name}.`)
    if (resolving.has(name)) throw new Error(`Circular definition involving ${name}.`)
    resolving.add(name)
    try { const value = evaluate(rows[0]); cache.set(name, value); return value } finally { resolving.delete(name) }
  }
  function evaluate(node: ExpressionAst): Value {
    switch (node.kind) {
      case 'array': throw new Error('Use scalar values in probability operations.')
      case 'number': return Number(node.value)
      case 'constant': return node.name === 'pi' ? Math.PI : Math.E
      case 'symbol': return resolve(node.name)
      case 'comparison': throw new Error('Comparisons belong inside P(event).')
      case 'unary': { const value = evaluate(node.operand); return node.operator === '+' ? value : typeof value === 'number' ? -value : affine(value, -1, 0) }
      case 'factorial': {
        const n = numeric(evaluate(node.operand))
        if (!Number.isInteger(n) || n < 0 || n > 170) throw new Error('Factorial requires an integer from 0 to 170.')
        let value = 1; for (let i = 2; i <= n; i++) value *= i
        return value
      }
      case 'binary': {
        const left = evaluate(node.left), right = evaluate(node.right)
        if (node.operator === '-') return subtract(left, right)
        if (node.operator === '+') return subtract(left, typeof right === 'number' ? -right : affine(right, -1, 0))
        if (node.operator === '*' && typeof left !== 'number' && typeof right === 'number') return affine(left, right, 0)
        if (node.operator === '*' && typeof right !== 'number' && typeof left === 'number') return affine(right, left, 0)
        if (node.operator === '/' && typeof left !== 'number' && typeof right === 'number' && right !== 0) return affine(left, 1 / right, 0)
        const a = numeric(left), b = numeric(right)
        return node.operator === '*' ? a * b : node.operator === '/' ? a / b : a ** b
      }
      case 'call': {
        if (isDistribution(node.name)) return { distribution: distribution(node.name, node.args.map(arg => numeric(evaluate(arg)))), identity: node, scale: 1, shift: 0 }
        if (node.name === 'P') return event(node.args[0]).probability
        if (node.name === 'E' || node.name === 'Var' || node.name === 'quantile') {
          const value = evaluate(node.args[0])
          if (typeof value === 'number') {
            if (node.name === 'quantile') { const p = numeric(evaluate(node.args[1])); if (p < 0 || p > 1) throw new Error('quantile: probability must be between 0 and 1.') }
            return node.name === 'Var' ? 0 : value
          }
          const { distribution: d, scale, shift } = value
          if (node.name === 'E') return scale * d.mean() + shift
          if (node.name === 'Var') return scale ** 2 * d.variance()
          const p = numeric(evaluate(node.args[1]))
          if (p < 0 || p > 1) throw new Error('quantile: probability must be between 0 and 1.')
          if (scale < 0 && d.discrete) throw new Error('Quantiles of decreasing discrete transformations are not supported yet.')
          return scale * d.quantile(scale > 0 ? p : 1 - p) + shift
        }
        const functions: Record<string, (x: number) => number> = { sqrt: Math.sqrt, abs: Math.abs, exp: Math.exp, ln: Math.log, log: Math.log, log10: Math.log10, sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos, atan: Math.atan, sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh }
        const fn = functions[node.name]
        if (!fn) throw new Error(`Evaluate ${node.name} separately before using it as a distribution parameter.`)
        return fn(numeric(evaluate(node.args[0])))
      }
    }
  }
  function event(node: ExpressionAst): ProbabilityEvent {
    if (node.kind !== 'comparison') throw new Error('P expects an event, for example P(X < 3) or P(1 <= X <= 4).')
    const values = node.operands.map(evaluate)
    const differences = node.operators.map((op, index) => ({ op, value: subtract(values[index], values[index + 1]) }))
    const variables = differences.flatMap(({ value }) => typeof value === 'number' ? [] : [value])
    const base = variables.length ? values.find((value): value is RandomValue => typeof value !== 'number') ?? null : null
    if (variables.some(value => value.identity !== base?.identity)) throw new Error('An event may involve only one random variable; independence is not assumed.')
    const includes = (x: number) => differences.every(({ op, value }) => compare(typeof value === 'number' ? value : value.scale * x + value.shift, op, 0))
    if (!base) return { random: null, probability: includes(0) ? 1 : 0, includes, boundaries: [] }
    let lower = -Infinity, upper = Infinity, lowerClosed = false, upperClosed = false
    const excluded: number[] = []
    for (const { op: original, value } of differences) {
      if (typeof value === 'number') { if (!compare(value, original, 0)) return { random: base, probability: 0, includes, boundaries: [] }; continue }
      const bound = -value.shift / value.scale
      const op = value.scale > 0 ? original : ({ '<': '>', '<=': '>=', '>': '<', '>=': '<=', '=': '=', '!=': '!=' } as const)[original]
      if (op === '!=') { excluded.push(bound); continue }
      if (op === '>' || op === '>=' || op === '=') {
        const closed = op !== '>'
        if (bound > lower) { lower = bound; lowerClosed = closed } else if (bound === lower) lowerClosed &&= closed
      }
      if (op === '<' || op === '<=' || op === '=') {
        const closed = op !== '<'
        if (bound < upper) { upper = bound; upperClosed = closed } else if (bound === upper) upperClosed &&= closed
      }
    }
    const d = base.distribution
    let result = 0
    if (lower < upper || (lower === upper && lowerClosed && upperClosed)) {
      const lo = d.discrete ? lowerClosed ? Math.ceil(lower) - 1 : Math.floor(lower) : lower
      const hi = d.discrete ? upperClosed ? Math.floor(upper) : Math.ceil(upper) - 1 : upper
      if (hi >= lo) {
        result = d.cdf(lo) > 0.5 ? d.sf(lo) - d.sf(hi) : d.cdf(hi) - d.cdf(lo)
        if (d.discrete) for (const x of new Set(excluded)) if (x >= lower && x <= upper && (x !== lower || lowerClosed) && (x !== upper || upperClosed)) result -= d.pdf(x)
      }
    }
    return { random: base, probability: Math.max(0, Math.min(1, result)), includes, boundaries: [lower, upper, ...excluded].filter(Number.isFinite) }
  }
  function isRandomDefinition(row: RelationAst): boolean {
    if (row.kind !== 'equation' || row.left.kind !== 'symbol') return false
    // Follow aliases without evaluating unrelated algebraic equations.
    function refers(node: ExpressionAst, visited = new Set<string>()): boolean {
      if (containsProbability(node)) return true
      if (node.kind === 'symbol') {
        const name = node.name.toLowerCase()
        if (visited.has(name)) return false
        const next = new Set(visited).add(name)
        return (definitions.get(name) ?? []).some(value => refers(value, next))
      }
      if (node.kind === 'binary') return refers(node.left, visited) || refers(node.right, visited)
      if (node.kind === 'unary') return refers(node.operand, visited)
      return false
    }
    return refers(row.right) && typeof resolve(row.left.name) !== 'number'
  }
  return { evaluate, event, isRandomDefinition, random }
}

export function probabilityDisplay(value: number): DisplayValue {
  if (Number.isNaN(value) || value === undefined) throw new Error('This distribution has no defined value for the requested statistic.')
  if (!Number.isFinite(value)) return { exact: value > 0 ? '∞' : '−∞', mathml: `<math><mo>${value > 0 ? '∞' : '−∞'}</mo></math>` }
  const text = Number(value.toPrecision(12)).toString()
  return { exact: `≈ ${text}`, mathml: `<math><mo>≈</mo><mn>${text}</mn></math>` }
}

export function prepareProbability(relations: RelationAst[]) {
  const context = probabilityContext(relations)
  const declarations: Record<string, DisplayValue> = {}
  function transform(node: ExpressionAst): ExpressionAst {
    if (node.kind === 'call' && probabilityCalls.has(node.name)) {
      const value = context.evaluate(node)
      if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('This statistic is undefined or infinite; evaluate it as a standalone query.')
      return { kind: 'number', value: String(value) }
    }
    if (node.kind === 'call' && isDistribution(node.name)) throw new Error('Use a named distribution declaration or P, E, Var, quantile.')
    if (node.kind === 'symbol' && Object.keys(declarations).some(name => name.toLowerCase() === node.name.toLowerCase())) {
      throw new Error(`Use P, E, Var or quantile to evaluate random variable ${node.name}.`)
    }
    if (node.kind === 'array') return { ...node, items: node.items.map(transform) }
    if (node.kind === 'binary') return { ...node, left: transform(node.left), right: transform(node.right) }
    if (node.kind === 'unary' || node.kind === 'factorial') return { ...node, operand: transform(node.operand) }
    if (node.kind === 'call') return { ...node, args: node.args.map(transform) }
    return node
  }
  const remaining: RelationAst[] = []
  for (const row of relations) {
    if (context.isRandomDefinition(row) && row.kind === 'equation' && row.left.kind === 'symbol') {
      declarations[row.left.name] = { exact: toLatex(row.right), mathml: toMathMl(row.right) }
    } else remaining.push(row)
  }
  // Fully numeric probability work can run locally, without waiting for Python.
  if (remaining.every(row => row.kind === 'query')) {
    try {
      const queries = remaining.map(row => probabilityDisplay(numericOrInfinite(context.evaluate((row as Extract<RelationAst, { kind: 'query' }>).expression))))
      return { relations: [], finish: (result: SolverResult) => result, result: { status: 'solved', variables: Object.keys(declarations), solutions: [{ assignments: declarations, queries }] } as SolverResult }
    } catch (error) {
      if (remaining.every(row => row.kind === 'query' && containsProbability(row.expression))) throw error
    }
  }
  const transformed = remaining.map((row): RelationAst => row.kind === 'equation' ? { ...row, left: transform(row.left), right: transform(row.right) } : { ...row, expression: transform(row.expression) })
  return {
    relations: transformed,
    result: undefined,
    finish: (result: SolverResult): SolverResult => result.status === 'solved' ? { ...result, variables: [...Object.keys(declarations), ...result.variables], solutions: result.solutions.map(solution => ({
      ...solution,
      assignments: { ...declarations, ...solution.assignments },
      queries: solution.queries.map((value, index) => {
        const query = remaining.filter(row => row.kind === 'query')[index]
        const approximate = Number(value.approximate ?? value.exact)
        return query?.kind === 'query' && containsProbability(query.expression) && Number.isFinite(approximate) ? probabilityDisplay(approximate) : value
      }),
    })) } : result,
  }
}
function numericOrInfinite(value: Value): number { if (typeof value !== 'number') throw new Error('Use P, E, Var or quantile to evaluate a random variable.'); return value }
