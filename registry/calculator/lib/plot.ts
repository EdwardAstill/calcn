import { hasProbability } from '@/registry/calculator/lib/probability'
import { prepareProbabilityPlot } from '@/registry/calculator/lib/probability-plot'
import { hasMatrixValues, type ExpressionAst } from '@/registry/calculator/lib/dsl/ast'
import { collectFreeSymbols } from '@/registry/calculator/lib/dsl/analyze'
import type { Relation } from '@/registry/calculator/lib/model'

export const PLOT_DOMAIN: [number, number] = [-10, 10]
export type PlotViewport = { x: [number, number]; y: [number, number] }
export const DEFAULT_VIEWPORT: PlotViewport = { x: [-10, 10], y: [-10, 10] }
type Evaluate = (values: Record<string, number>) => number
export type PlotPoint = { x: number; y: number | null; shaded?: number }
export type PlotCurve = { id: string; label: string; fn?: (x: number) => number; data?: PlotPoint[]; discrete?: boolean; shaded?: boolean }

const functions: Record<string, (value: number) => number> = {
  sqrt: Math.sqrt, abs: Math.abs, exp: Math.exp, ln: Math.log, log: Math.log,
  log10: Math.log10, sin: Math.sin, cos: Math.cos, tan: Math.tan,
  asin: Math.asin, acos: Math.acos, atan: Math.atan,
  sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh,
  simplify: (value) => value, expand: (value) => value, factor: (value) => value,
}

function compile(node: ExpressionAst): Evaluate {
  switch (node.kind) {
    case 'array': throw new Error('Plot a two-component vector or parametric curve.')
    case 'comparison': throw new Error('Use P(event) to plot a probability event.')
    case 'number': return () => Number(node.value)
    case 'constant': return () => node.name === 'pi' ? Math.PI : Math.E
    case 'symbol': return (values) => values[node.name.toLowerCase()] ?? NaN
    case 'unary': {
      const operand = compile(node.operand)
      return (values) => (node.operator === '-' ? -1 : 1) * operand(values)
    }
    case 'binary': {
      const left = compile(node.left)
      const right = compile(node.right)
      return (values) => {
        const a = left(values), b = right(values)
        switch (node.operator) {
          case '+': return a + b
          case '-': return a - b
          case '*': return a * b
          case '/': return a / b
          case '^': return a ** b
        }
      }
    }
    case 'factorial': {
      const operand = compile(node.operand)
      return (values) => {
        const n = operand(values)
        if (!Number.isInteger(n) || n < 0 || n > 170) return NaN
        let result = 1
        for (let i = 2; i <= n; i++) result *= i
        return result
      }
    }
    case 'call': {
      const fn = functions[node.name]
      if (!fn) throw new Error(`Plotting ${node.name} is not supported. Use its evaluated expression instead.`)
      const argument = compile(node.args[0]!)
      return (values) => fn(argument(values))
    }
  }
}

// Trace zero contours in the visible viewing window. Triangles avoid ambiguous
// four-edge crossings; null separators keep independent segments disconnected.
export function sampleEquation(fn: (x: number, y: number) => number, viewport = DEFAULT_VIEWPORT): PlotPoint[] {
  const steps = 100
  const { x: [left, right], y: [bottom, top] } = viewport
  const grid = Array.from({ length: steps + 1 }, (_, row) =>
    Array.from({ length: steps + 1 }, (_, col) => {
      const x = left + col * (right - left) / steps
      const y = bottom + row * (top - bottom) / steps
      return { x, y, value: fn(x, y) }
    }),
  )
  type Vertex = typeof grid[number][number]
  const data: PlotPoint[] = []
  function triangle(vertices: Vertex[]) {
    const crossings: PlotPoint[] = []
    for (let i = 0; i < 3; i++) {
      const a = vertices[i]!, b = vertices[(i + 1) % 3]!
      if (!Number.isFinite(a.value) || !Number.isFinite(b.value)) continue
      if ((a.value < 0) === (b.value < 0)) continue
      let left = a, right = b
      // Refine and reject sign changes caused by poles rather than roots.
      for (let j = 0; j < 24; j++) {
        const x = (left.x + right.x) / 2, y = (left.y + right.y) / 2
        const middle = { x, y, value: fn(x, y) }
        if ((middle.value < 0) === (left.value < 0)) left = middle
        else right = middle
      }
      const point = Math.abs(left.value) < Math.abs(right.value) ? left : right
      if (Math.abs(point.value) <= 1e-6 * Math.max(1, Math.abs(a.value), Math.abs(b.value))) {
        crossings.push({ x: point.x, y: point.y })
      }
    }
    if (crossings.length === 2) data.push(...crossings, { x: crossings[1]!.x, y: null })
  }
  for (let row = 0; row < steps; row++) {
    for (let col = 0; col < steps; col++) {
      const a = grid[row]![col]!, b = grid[row]![col + 1]!
      const c = grid[row + 1]![col + 1]!, d = grid[row + 1]![col]!
      triangle([a, b, c])
      triangle([a, c, d])
    }
  }
  return data
}

export function preparePlot(relations: readonly Relation[], viewport?: PlotViewport): { xLabel: string; yLabel: string; curves: PlotCurve[]; viewport?: PlotViewport } {
  if (hasProbability(relations.filter(row => row.enabled).map(row => row.ast))) return prepareProbabilityPlot(relations, viewport)
  if (hasMatrixValues(relations.filter(row => row.enabled).map(row => row.ast))) return prepareVectorPlot(relations, viewport ?? DEFAULT_VIEWPORT)
  viewport ??= DEFAULT_VIEWPORT
  const selected = relations.filter((relation) => relation.enabled)
  const symbols = new Set<string>()
  for (const { ast } of selected) {
    const expressions = ast.kind === 'equation' ? [ast.left, ast.right] : [ast.expression]
    for (const expression of expressions) {
      for (const name of collectFreeSymbols(expression)) symbols.add(name)
    }
  }
  if (symbols.size > 2) {
    throw new Error(`Cannot plot more than 2 variables. The ticked relations contain ${symbols.size}: ${[...symbols].sort().join(', ')}. Untick relations to use at most 2 variables.`)
  }
  const names = [...symbols].sort()
  const xLabel = symbols.has('x') ? 'x' : names.find((name) => name !== 'y') ?? 'x'
  const yLabel = names.find((name) => name !== xLabel) ?? 'y'
  const curves = selected.map((relation) => {
    const { ast } = relation
    if (ast.kind === 'query') {
      if (collectFreeSymbols(ast.expression).size > 1) {
        throw new Error(`Write an equation for "${relation.source}" to plot a relation between two variables.`)
      }
      const evaluate = compile(ast.expression)
      const variable = [...collectFreeSymbols(ast.expression)][0] ?? xLabel
      return { id: relation.id, label: relation.source, fn: (x: number) => evaluate({ [variable]: x }) }
    }
    const left = compile(ast.left), right = compile(ast.right)
    const data = sampleEquation((x, y) => {
      const values = { [xLabel]: x, [yLabel]: y }
      return left(values) - right(values)
    }, viewport)
    return { id: relation.id, label: relation.source, data }
  })
  return { xLabel, yLabel, curves }
}


function prepareVectorPlot(relations: readonly Relation[], viewport: PlotViewport) {
  const selected = relations.filter(row => row.enabled)
  const definitions = new Map<string, ExpressionAst>()
  for (const { ast } of selected) if (ast.kind === 'equation' && ast.left.kind === 'symbol') {
    const name = ast.left.name.toLowerCase()
    if (definitions.has(name)) throw new Error(`Multiple definitions for ${name}`)
    definitions.set(name, ast.right)
  }
  function expand(node: ExpressionAst, visiting = new Set<string>()): ExpressionAst {
    if (node.kind === 'symbol' && definitions.has(node.name.toLowerCase())) {
      const name = node.name.toLowerCase()
      if (visiting.has(name)) throw new Error(`Circular definition involving ${name}`)
      return expand(definitions.get(name)!, new Set([...visiting, name]))
    }
    if (node.kind === 'array') return { ...node, items: node.items.map(item => expand(item, visiting)) }
    if (node.kind === 'binary') {
      const left = expand(node.left, visiting), right = expand(node.right, visiting)
      if (left.kind === 'array' || right.kind === 'array') {
        if ((node.operator === '+' || node.operator === '-') && left.kind === 'array' && right.kind === 'array' && left.items.length === right.items.length) {
          return { kind: 'array', items: left.items.map((item, i) => expand({ ...node, left: item, right: right.items[i]! }, visiting)) }
        }
        if (node.operator === '*' && (left.kind === 'array') !== (right.kind === 'array')) {
          const items = left.kind === 'array' ? left.items : right.kind === 'array' ? right.items : []
          return { kind: 'array', items: items.map(item => expand({ ...node, left: left.kind === 'array' ? item : left, right: right.kind === 'array' ? item : right }, visiting)) }
        }
        throw new Error('For this operation, plot its evaluated two-component vector instead.')
      }
      return { ...node, left, right }
    }
    if (node.kind === 'unary') {
      const operand = expand(node.operand, visiting)
      return operand.kind === 'array' ? { kind: 'array', items: operand.items.map(item => ({ ...node, operand: item })) } : { ...node, operand }
    }
    if (node.kind === 'call') return { ...node, args: node.args.map(arg => expand(arg, visiting)) }
    return node
  }
  const curves: PlotCurve[] = []
  for (const row of selected) {
    if (row.ast.kind === 'equation' && row.ast.left.kind !== 'symbol') throw new Error('Select vector definitions or two-component expressions to plot together.')
    const node = expand(row.ast.kind === 'query' ? row.ast.expression : row.ast.right)
    if (node.kind !== 'array') {
      if (row.ast.kind === 'equation' && collectFreeSymbols(node).size === 0) continue
      throw new Error('Select two-component vectors or parametric expressions to plot.')
    }
    if (node.items.length !== 2 || node.items.some(item => item.kind === 'array')) throw new Error('Only 2D vectors and two-component parametric curves can be plotted.')
    const names = [...collectFreeSymbols(node)]
    if (names.length > 1) throw new Error('A parametric curve requires exactly one free parameter.')
    const fx = compile(node.items[0]!), fy = compile(node.items[1]!)
    let data: PlotPoint[]
    if (names.length) {
      data = Array.from({ length: 801 }, (_, index) => {
        const values = { [names[0]!]: -10 + index / 800 * 20 }
        const x = fx(values), y = fy(values)
        return { x: Number.isFinite(x) ? x : 0, y: Number.isFinite(x) && Number.isFinite(y) ? y : null }
      })
    } else {
      const x = fx({}), y = fy({})
      if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error('Vector coordinates must be finite real numbers.')
      const dx = x / (viewport.x[1] - viewport.x[0]), dy = y / (viewport.y[1] - viewport.y[0])
      const length = Math.hypot(dx, dy), size = Math.min(0.025, length / 3)
      const ux = length ? dx / length * size : 0, uy = length ? dy / length * size : 0
      data = [{ x: 0, y: 0 }, { x, y }, { x: x - (ux + uy / 2) * (viewport.x[1] - viewport.x[0]), y: y - (uy - ux / 2) * (viewport.y[1] - viewport.y[0]) }, { x, y }, { x: x - (ux - uy / 2) * (viewport.x[1] - viewport.x[0]), y: y - (uy + ux / 2) * (viewport.y[1] - viewport.y[0]) }]
    }
    curves.push({ id: row.id, label: names.length ? `${row.source} (${names[0]}: −10…10)` : row.source, data })
  }
  return { xLabel: 'x', yLabel: 'y', curves }
}
