import { describe, expect, test } from 'bun:test'
import { parseRelation } from '@/registry/calculator/lib/dsl/parser'
import { relationToMathMl } from '@/registry/calculator/lib/dsl/mathml'
import { relationToLatex } from '@/registry/calculator/lib/dsl/latex'
import { probabilityContext, prepareProbability } from '@/registry/calculator/lib/probability'
import { distribution } from '@/registry/calculator/lib/distributions'
import { preparePlot } from '@/registry/calculator/lib/plot'
import { completeFunction, functionHint } from '@/registry/calculator/lib/completion'
import { createSolverClient } from '@/registry/calculator/lib/solver/client'

function evaluate(source: string, definitions: string[] = []): number {
  const row = parseRelation(source)
  if (row.kind !== 'query') throw new Error('Expected query')
  return probabilityContext(definitions.map(parseRelation)).evaluate(row.expression) as number
}
const plotRows = (sources: string[]) => sources.map((source, i) => ({ id: String(i), source, ast: parseRelation(source), enabled: true, createdAt: 0 }))

describe('probability expressions', () => {
  test('supports declarations, reversed comparisons, chains and unicode', () => {
    expect(evaluate('P(3.1 > N(0,1))')).toBeCloseTo(0.999032396786782, 12)
    expect(evaluate('P(-1 < X < 1)', ['X = Norm(0,1)'])).toBeCloseTo(0.682689492137086, 12)
    expect(evaluate('P(-1 ≤ X ≤ 1)', ['X = Norm(0,1)'])).toBeCloseTo(0.682689492137086, 12)
    expect(evaluate('P(X > 10)', ['X = Norm(0,1)']) / 7.61985302416047e-24).toBeCloseTo(1, 12)
    expect(evaluate('P(X < -10)', ['X = Norm(0,1)']) / 7.61985302416047e-24).toBeCloseTo(1, 12)
    expect(evaluate('P(X = 0)', ['X = Norm(0,1)'])).toBe(0)
  })
  test('keeps Normal variance, Weib shape/scale, Exp rate and exp arithmetic distinct', () => {
    expect(evaluate('Var(Norm(0,4))')).toBe(4)
    expect(evaluate('P(Norm(0,4) < 2)')).toBeCloseTo(0.841344746068543, 12)
    expect(evaluate('P(Weib(2,5) > 10)')).toBeCloseTo(Math.exp(-4), 12)
    expect(evaluate('E(Exp(2))')).toBe(0.5)
    expect(evaluate('exp(2)')).toBeCloseTo(Math.exp(2), 12)
    expect(() => parseRelation('Wieb(2,5)')).toThrow('Unknown function')
    expect(parseRelation('n + p + t + e').kind).toBe('query')
  })
  test('handles exact, strict and fractional discrete bounds', () => {
    const defs = ['Y = Pois(4)']
    expect(evaluate('P(Y = 3)', defs)).toBeCloseTo(0.195366814813165, 12)
    expect(evaluate('P(Y <= 3)', defs) - evaluate('P(Y < 3)', defs)).toBeCloseTo(evaluate('P(Y = 3)', defs), 12)
    expect(evaluate('P(Y = 3.1)', defs)).toBe(0)
    expect(evaluate('P(Y < 3.1)', defs)).toBeCloseTo(evaluate('P(Y <= 3)', defs), 12)
    expect(evaluate('P(Y != 3)', defs)).toBeCloseTo(1 - evaluate('P(Y = 3)', defs), 12)
    expect(evaluate('P(4 <= Y <= 3)', defs)).toBe(0)
    expect(evaluate('P(Y <= -1)', defs)).toBe(0)
    expect(evaluate('P(Bin(10,0) = 0)')).toBe(1)
    expect(evaluate('P(Bin(10,1) < 10)')).toBe(0)
    expect(evaluate('P(Pois(0) = 0)')).toBe(1)
    expect(evaluate('P(Bin(0,0.5) = 0)')).toBe(1)
  })
  test('resolves parameter definitions regardless of row order', () => {
    expect(evaluate('E(X)', ['X = Norm(mu, v)', 'v = 4', 'mu = 7'])).toBe(7)
    expect(evaluate('Var(X)', ['X = Norm(mu, v)', 'v = 4', 'mu = 7'])).toBe(4)
  })
  test('preserves random variable identity and affine transformations', () => {
    const defs = ['X = N(0,1)', 'Y = 2*X + 3']
    expect(evaluate('E(Y)', defs)).toBe(3)
    expect(evaluate('Var(Y)', defs)).toBe(4)
    expect(evaluate('P(Y < 5)', defs)).toBeCloseTo(0.841344746068543, 12)
    expect(evaluate('P(X - X = 0)', defs)).toBe(1)
    expect(evaluate('P(X < X)', defs)).toBe(0)
    expect(evaluate('P(-2*X > 0)', defs)).toBeCloseTo(0.5, 12)
    expect(() => evaluate('P(X < Y)', ['X=N(0,1)', 'Y=N(0,1)'])).toThrow('dependence')
  })
  test('rejects invalid parameters and missing, duplicate or circular definitions', () => {
    for (const source of ['Norm(0,0)', 'Norm(0,-1)', 'Pois(-1)', 'Bin(2.5,0.5)', 'Bern(2)', 'Unif(1,1)', 'Weib(0,1)', 'Gamma(1,-1)', 'Beta(-1,1)', 'T(0)', 'Chi2(-1)', 'F(1,0)']) expect(() => evaluate(source)).toThrow()
    expect(() => evaluate('P(X < 1)')).toThrow('Define')
    expect(() => evaluate('E(X)', ['X=N(0,1)', 'X=N(1,1)'])).toThrow('one definition')
    expect(() => evaluate('E(X)', ['X=N(mu,1)', 'mu=X'])).toThrow('Circular')
    expect(() => evaluate('quantile(N(0,1), 1.1)')).toThrow('between')
  })
  test('all distributions have consistent quantiles and moments', () => {
    const cases = [['Norm', [3, 4], 3, 4], ['Pois', [4], 4, 4], ['Bin', [10, 0.3], 3, 2.1], ['Bern', [0.3], 0.3, 0.21], ['Unif', [2, 8], 5, 3], ['Exp', [2], 0.5, 0.25], ['Weib', [1, 2], 2, 4], ['Gamma', [2, 3], 6, 18], ['Beta', [2, 2], 0.5, 0.05], ['T', [5], 0, 5 / 3], ['Chi2', [3], 3, 6], ['F', [5, 10], 1.25, 1.35416666666667]] as const
    for (const [name, args, mean, variance] of cases) {
      const d = distribution(name, [...args])
      expect(d.mean()).toBeCloseTo(mean, 8)
      expect(d.variance()).toBeCloseTo(variance, 8)
      for (const p of [0.01, 0.5, 0.99]) {
        const q = d.quantile(p)
        if (d.discrete) { expect(d.cdf(q)).toBeGreaterThanOrEqual(p - 1e-12); expect(d.cdf(q - 1)).toBeLessThan(p) }
        else expect(d.cdf(q)).toBeCloseTo(p, 7)
      }
    }
  })
  test('does not send random variables to the algebra solver as ordinary unknowns', () => {
    expect(() => prepareProbability(['X=N(0,1)', 'X+z'].map(parseRelation))).toThrow('random variable')
    const result = prepareProbability(['X=N(0,1)', 'z=2', 'P(X<0)+z'].map(parseRelation))
    expect(result.relations).toEqual(['z=2', '0.5+z'].map(parseRelation))
  })
  test('reports undefined moments and supports infinite standalone quantiles', () => {
    expect(() => prepareProbability(['E(T(1))'].map(parseRelation))).toThrow('no defined value')
    const result = prepareProbability(['Var(T(2))', 'quantile(N(0,1), 1)'].map(parseRelation)).result
    expect(result?.status).toBe('solved')
    if (result?.status === 'solved') expect(result.solutions[0].queries.map(q => q.exact)).toEqual(['∞', '∞'])
  })
  test('renders every argument and escapes comparisons', () => {
    const row = parseRelation('X = Norm(0,4)')
    expect(relationToMathMl(row)).toContain('<mn>4</mn>')
    expect(relationToLatex(row)).toContain('0, 4')
    expect(relationToMathMl(parseRelation('P(X < 3)'))).toContain('&lt;')
    expect(relationToLatex(parseRelation('P(X <= 3)'))).toContain('\\le')
  })
  test('evaluates through the real client without starting a Python worker', async () => {
    const client = createSolverClient(() => { throw new Error('Worker should not start') })
    const result = await client.solve(['X=N(0,1)', 'P(X<0)', 'Var(X)'].map(parseRelation))
    expect(result.status).toBe('solved')
    if (result.status === 'solved') {
      expect(result.solutions[0].queries[0].exact).toBe('≈ 0.5')
      expect(result.variables).toEqual(['X'])
    }
    expect(prepareProbability(['X=N(0,1)'].map(parseRelation)).result?.status).toBe('solved')
  })
})

describe('distribution plots', () => {
  test('frames distributions and shades probability events', () => {
    const plot = preparePlot(plotRows(['X=Norm(100,225)', 'P(80<X<120)']))
    expect(plot.yLabel).toBe('density')
    expect(plot.viewport!.x[0]).toBeLessThan(80)
    expect(plot.viewport!.x[1]).toBeGreaterThan(120)
    expect(plot.curves).toHaveLength(2)
    const selected = plot.curves[1].data!.filter(p => (p.shaded ?? 0) > 0)
    expect(selected.length).toBeGreaterThan(0)
    expect(selected.every(p => p.x > 80 && p.x < 120)).toBe(true)
  })
  test('plots transformed events on the same axis as their declaration', () => {
    const plot = preparePlot(plotRows(['X=N(0,1)', 'Y=2*X+3', 'P(Y<5)']))
    const event = plot.curves[2].data!
    const peak = event.reduce((a, b) => (a.y ?? 0) > (b.y ?? 0) ? a : b)
    expect(peak.x).toBeCloseTo(3, 1)
    expect(event.filter(p => (p.shaded ?? 0) > 0).every(p => p.x < 5)).toBe(true)
  })
  test('samples probability masses only at supported integers', () => {
    const plot = preparePlot(plotRows(['Y=Pois(4)', 'P(Y=3)']))
    expect(plot.yLabel).toBe('probability')
    expect(plot.curves[0].discrete).toBe(true)
    expect(plot.curves[0].data!.every(p => Number.isInteger(p.x))).toBe(true)
    expect(plot.curves[1].data!.filter(p => p.shaded! > 0).map(p => p.x)).toEqual([3])
  })
  test('allows many distribution declarations and rejects mixed vertical units', () => {
    expect(preparePlot(plotRows(['X=N(0,1)', 'Y=N(1,2)', 'Z=N(2,3)'])).curves).toHaveLength(3)
    expect(() => preparePlot(plotRows(['X=N(0,1)', 'Y=Pois(4)']))).toThrow('separately')
  })
})

describe('inline function help', () => {
  test('completes distribution and calculus names, with explicit parameters', () => {
    expect(completeFunction('X = Nor', 7)?.suffix).toBe('m(mean, variance)')
    expect(completeFunction('dif', 3)?.suffix).toBe('f(expression, variable)')
    expect(completeFunction('Wei', 3)?.signature).toBe('Weib(shape, scale)')
    expect(completeFunction('Wieb', 4)).toBeNull()
    expect(completeFunction('diff(x)', 2)).toBeNull()
    expect(functionHint('diff(sin(x), ', 13)).toContain('— variable')
    expect(functionHint('Norm(0, ', 8)).toContain('— variance')
  })
})
