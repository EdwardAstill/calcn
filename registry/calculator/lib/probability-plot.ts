import type { Relation } from '@/registry/calculator/lib/model'
import type { PlotViewport, PlotCurve } from '@/registry/calculator/lib/plot'
import { probabilityContext, type ProbabilityEvent } from '@/registry/calculator/lib/probability'

export function prepareProbabilityPlot(relations: readonly Relation[], viewport?: PlotViewport) {
  const selected = relations.filter(row => row.enabled)
  const context = probabilityContext(selected.map(row => row.ast))
  const series = selected.flatMap(row => {
    const ast = row.ast
    let event: ProbabilityEvent | undefined
    if (context.isRandomDefinition(ast) && ast.kind === 'equation') {
      return [{ row, value: context.random(context.evaluate(ast.right)), event }]
    }
    if (ast.kind === 'query' && ast.expression.kind === 'call' && ast.expression.name === 'P') {
      event = context.event(ast.expression.args[0])
      if (!event.random) throw new Error('This event is deterministic and has no distribution to plot.')
      return [{ row, value: event.random, event }]
    }
    if (ast.kind === 'query') {
      const value = context.random(context.evaluate(ast.expression))
      return [{ row, value, event }]
    }
    // Numeric parameter definitions contribute context, not extra graph curves.
    if (ast.kind === 'equation' && ast.left.kind === 'symbol' && typeof context.evaluate(ast.right) === 'number') return []
    throw new Error('Select distribution declarations and P(event) queries together. Plot ordinary equations separately.')
  })
  if (!series.length) throw new Error('Select a distribution declaration or P(event) to plot.')
  if (series.some(s => s.value.distribution.discrete) && series.some(s => !s.value.distribution.discrete)) throw new Error('Plot discrete and continuous distributions separately: probability and density use different vertical scales.')
  const ranges = series.map(({ value: { distribution: d, scale, shift }, event }) => {
    const endpoints = [d.quantile(0.001), d.quantile(0.999)].map(x => scale * x + shift)
    if (event) endpoints.push(...event.boundaries.map(x => x * scale + shift))
    if (endpoints.some(x => !Number.isFinite(x))) throw new Error('Could not determine a finite plot range for these parameters.')
    return [Math.min(...endpoints), Math.max(...endpoints)]
  })
  const lower = Math.min(...ranges.map(r => r[0])), upper = Math.max(...ranges.map(r => r[1]))
  const padding = Math.max((upper - lower) * 0.06, upper === lower ? 1 : 0)
  const xRange: [number, number] = viewport?.x ?? [lower - padding, upper + padding]
  const curves: PlotCurve[] = series.map(({ row, value: { distribution: d, scale, shift }, event }) => {
    let xs: number[]
    if (d.discrete) {
      const baseBounds = xRange.map(x => (x - shift) / scale)
      const start = Math.max(d.support[0], Math.ceil(Math.min(...baseBounds)))
      const end = Math.min(d.support[1], Math.floor(Math.max(...baseBounds)))
      if (end - start > 2000) throw new Error('Too many discrete outcomes to display. Zoom in or use smaller distribution parameters.')
      xs = Array.from({ length: Math.max(0, end - start + 1) }, (_, i) => (start + i) * scale + shift).sort((a, b) => a - b)
    } else {
      xs = Array.from({ length: 501 }, (_, i) => xRange[0] + i / 500 * (xRange[1] - xRange[0]))
      const edges = (event?.boundaries ?? d.support.filter(Number.isFinite)).map(x => x * scale + shift)
      // Include both sides of event edges so shading stops at the actual cutoff.
      const epsilon = (xRange[1] - xRange[0]) * 1e-9
      xs.push(...edges.flatMap(x => event ? [x - epsilon, x, x + epsilon] : [x]).filter(x => x >= xRange[0] && x <= xRange[1]))
      xs.sort((a, b) => a - b)
    }
    const data = xs.map(x => {
      const base = (x - shift) / scale
      const y = d.pdf(base) / (d.discrete ? 1 : Math.abs(scale))
      return { x, y: Number.isFinite(y) ? y : null, shaded: event?.includes(base) && Number.isFinite(y) ? y : 0 }
    })
    return { id: row.id, label: event ? `${row.source} ≈ ${Number(event.probability.toPrecision(7))}` : row.source, data, discrete: d.discrete, shaded: !!event }
  })
  const peak = Math.max(0, ...curves.flatMap(curve => curve.data!.map(p => p.y ?? 0)))
  const suggested: PlotViewport = { x: xRange, y: [0, peak > 0 ? peak * 1.15 : 1] }
  return { curves, xLabel: 'value', yLabel: series[0].value.distribution.discrete ? 'probability' : 'density', viewport: viewport ?? suggested }
}
