import { describe, expect, it } from 'bun:test'
import { parseRelation } from '@/registry/calculator/lib/dsl/parser'
import { relationToMathMl } from '@/registry/calculator/lib/dsl/mathml'

describe('relationToMathMl', () => {
  it('renders equations, implicit products, powers, and fractions as native MathML', () => {
    const mathml = relationToMathMl(parseRelation('2x + 1/3 = x^2'))

    expect(mathml).toContain('<math')
    expect(mathml).toContain('<mi>x</mi>')
    expect(mathml).toContain('<mfrac><mn>1</mn><mn>3</mn></mfrac>')
    expect(mathml).toContain('<msup><mi>x</mi><mn>2</mn></msup>')
    expect(mathml).toContain('<mo>=</mo>')
    expect(mathml).not.toContain('katex')
  })

  it('renders scientific, algebra, and calculus notation semantically', () => {
    expect(relationToMathMl(parseRelation('sqrt(x)'))).toContain(
      '<msqrt><mi>x</mi></msqrt>',
    )
    expect(relationToMathMl(parseRelation('diff(x^2, x)'))).toContain(
      '<mfrac><mi>d</mi><mrow><mi>d</mi><mi>x</mi></mrow></mfrac>',
    )
    expect(relationToMathMl(parseRelation('integrate(sin(x), x)'))).toContain(
      '<mo>&#x222B;</mo>',
    )
  })

  it('escapes symbol names before inserting them into markup', () => {
    const relation = parseRelation('safe_name')
    if (relation.kind !== 'query' || relation.expression.kind !== 'symbol') {
      throw new Error('Expected a symbol query')
    }
    relation.expression.name = '<unsafe>'

    const mathml = relationToMathMl(relation)
    expect(mathml).toContain('&lt;unsafe&gt;')
    expect(mathml).not.toContain('<unsafe>')
  })
})
