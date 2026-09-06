import { describe, expect, it } from 'bun:test'
import { parseRelation } from '@/registry/calculator/lib/dsl/parser'

describe('parseRelation', () => {
  it.each(['2x', '2(x+1)', '(x+1)(x-1)', '2 sin(x)'])(
    'parses implicit multiplication in %s',
    (source) => {
      expect(JSON.stringify(parseRelation(source))).toContain(
        '"operator":"*"',
      )
    },
  )

  it('parses an equation distinctly from a query', () => {
    expect(parseRelation('2x + 3 = 7').kind).toBe('equation')
    expect(parseRelation('factor(x^2-1)').kind).toBe('query')
  })

  it('makes exponentiation right associative and stronger than unary minus', () => {
    expect(parseRelation('-x^2')).toMatchObject({
      kind: 'query',
      expression: {
        kind: 'unary',
        operator: '-',
        operand: { kind: 'binary', operator: '^' },
      },
    })
    expect(parseRelation('2^3^2')).toMatchObject({
      kind: 'query',
      expression: {
        kind: 'binary',
        operator: '^',
        right: { kind: 'binary', operator: '^' },
      },
    })
  })

  it('accepts braces but never requires them', () => {
    expect(parseRelation('sqrt{x+1}')).toEqual(parseRelation('sqrt(x+1)'))
  })

  it('parses scientific numbers, constants, and factorials', () => {
    expect(parseRelation('1.5e-2 pi + 5!')).toMatchObject({
      kind: 'query',
      expression: { kind: 'binary', operator: '+' },
    })
  })

  it('allows a single-letter symbol next to a group', () => {
    expect(parseRelation('x(y+1)')).toMatchObject({
      kind: 'query',
      expression: { kind: 'binary', operator: '*', implicit: true },
    })
  })

  it('rejects unknown function-call shapes and wrong arity with positions', () => {
    expect(() => parseRelation('mystery(x)')).toThrowError(
      /Unknown function "mystery" at position 1/i,
    )
    expect(() => parseRelation('diff(x)')).toThrowError(
      /diff expects 2 arguments at position/i,
    )
  })

  it('reports incomplete groups and repeated equals signs', () => {
    expect(() => parseRelation('(x+1')).toThrowError(/Expected.*\).*position/i)
    expect(() => parseRelation('x=1=2')).toThrowError(/Unexpected.*=.*position/i)
  })
})
