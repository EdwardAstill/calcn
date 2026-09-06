import { describe, expect, it } from 'bun:test'
import { parseRelation } from '@/registry/calculator/lib/dsl/parser'
import { collectEquationSymbols, collectFreeSymbols } from '@/registry/calculator/lib/dsl/analyze'

describe('AST symbol analysis', () => {
  it('counts only distinct symbols from equation rows', () => {
    const rows = [
      parseRelation('x+y=2'),
      parseRelation('x-y=0'),
      parseRelation('z^2'),
    ]

    expect(collectEquationSymbols(rows)).toEqual(['x', 'y'])
  })

  it('normalizes symbol names for comparison', () => {
    expect(collectEquationSymbols([parseRelation('X+x=2')])).toEqual(['x'])
  })

  it('does not add a calculus binding argument as a free symbol', () => {
    const relation = parseRelation('diff(y^2, x)')
    if (relation.kind !== 'query') throw new Error('Expected query')

    expect([...collectFreeSymbols(relation.expression)]).toEqual(['y'])
  })
})
