import { describe, expect, it } from 'bun:test'
import { relationToLatex } from '@/registry/calculator/lib/dsl/latex'
import { parseRelation } from '@/registry/calculator/lib/dsl/parser'

describe('relationToLatex', () => {
  it('renders implicit products, fractions, and equations', () => {
    expect(relationToLatex(parseRelation('2x + 1/3 = 4'))).toBe(
      '2x + \\frac{1}{3} = 4',
    )
  })

  it('preserves precedence with the minimum needed grouping', () => {
    expect(relationToLatex(parseRelation('(x+1)(x-1)'))).toBe(
      '\\left(x + 1\\right)\\left(x - 1\\right)',
    )
    expect(relationToLatex(parseRelation('-x^2'))).toBe('-x^{2}')
  })

  it('renders scientific, algebra, and calculus calls', () => {
    expect(relationToLatex(parseRelation('sin(pi/2)'))).toBe(
      '\\sin\\left(\\frac{\\pi}{2}\\right)',
    )
    expect(relationToLatex(parseRelation('factor(x^2-1)'))).toBe(
      '\\operatorname{factor}\\left(x^{2} - 1\\right)',
    )
    expect(relationToLatex(parseRelation('diff(x^2, x)'))).toBe(
      '\\frac{d}{d x}\\left(x^{2}\\right)',
    )
  })
})
