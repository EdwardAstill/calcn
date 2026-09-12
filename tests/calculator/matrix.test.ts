import { describe, expect, it } from 'bun:test'
import { parseRelation } from '@/registry/calculator/lib/dsl/parser'
import { relationToLatex } from '@/registry/calculator/lib/dsl/latex'
import { relationToMathMl } from '@/registry/calculator/lib/dsl/mathml'
import { collectFreeSymbols } from '@/registry/calculator/lib/dsl/analyze'
import { completeFunction, functionHint } from '@/registry/calculator/lib/completion'
import { preflight } from '@/registry/calculator/lib/solver/preflight'
import { preparePlot } from '@/registry/calculator/lib/plot'
import type { Relation } from '@/registry/calculator/lib/model'

const rows = (...sources: string[]): Relation[] => sources.map((source, index) => ({ id: String(index), source, ast: parseRelation(source), enabled: true, createdAt: index }))

describe('vectors and matrices', () => {
  it('parses nested rows and rejects empty, ragged and higher-dimensional arrays', () => {
    expect(parseRelation('A=[[1,2],[3,4]]').kind).toBe('equation')
    for (const source of ['[]', '[[]]', '[[1],[2,3]]', '[1,[2]]', '[[[1]]]']) expect(() => parseRelation(source)).toThrow()
    expect(parseRelation('2[1,2]').kind).toBe('query')
  })
  it('renders column vectors and conventional matrices', () => {
    expect(relationToLatex(parseRelation('[1,2]'))).toBe('\\begin{bmatrix}1 \\\\ 2\\end{bmatrix}')
    expect(relationToLatex(parseRelation('[[1,2],[3,4]]'))).toContain('1 & 2 \\\\ 3 & 4')
    expect(relationToMathMl(parseRelation('[1,2]'))).toContain('<mtable><mtr><mtd><mn>1</mn></mtd></mtr>')
  })
  it('collects component symbols and accepts vector definitions in preflight', () => {
    const row = parseRelation('jacobian([x*y,sin(x)],[x,y])')
    if (row.kind !== 'query') throw new Error('Expected query')
    expect([...collectFreeSymbols(row.expression)].sort()).toEqual(['x', 'y'])
    expect(preflight([parseRelation('v=[1,2]'), parseRelation('v=[2,3]')]).ok).toBe(true)
  })
  it('completes operations and keeps argument hints correct inside vector literals', () => {
    expect(completeFunction('jaco', 4)?.insertion).toBe('jacobian(')
    const source = 'jacobian([x,y], [x,'
    expect(functionHint(source, source.length)).toBe('jacobian(vector, variables) — variables')
    expect(() => parseRelation('dot([1,2])')).toThrow('2 arguments')
  })
  it('plots vectors as arrows and reuses scalar/vector definitions', () => {
    const plot = preparePlot(rows('a=2', 'u=[1,2]', 'v=3*u'))
    expect(plot.curves).toHaveLength(2)
    expect(plot.curves[1]!.data?.slice(0,2)).toEqual([{x:0,y:0},{x:3,y:6}])
    expect(plot.curves[0]!.data).toHaveLength(5)
    expect(preparePlot(rows('[0,0]')).curves[0]!.data?.every(p => Number.isFinite(p.x))).toBe(true)
  })
  it('samples a parametric circle and rejects unsupported dimensions', () => {
    const curve = preparePlot(rows('r=[cos(t),sin(t)]')).curves[0]!
    for (const point of curve.data!) expect(point.x ** 2 + point.y! ** 2).toBeCloseTo(1, 10)
    expect(curve.label).toContain('t: −10…10')
    expect(() => preparePlot(rows('[1,2,3]'))).toThrow('2D')
    expect(() => preparePlot(rows('[[1,2],[3,4]]'))).toThrow('2D')
    expect(() => preparePlot(rows('[t,s]'))).toThrow('one free parameter')
  })
})
