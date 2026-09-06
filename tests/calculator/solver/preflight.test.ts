import { describe, expect, it } from 'bun:test'
import { parseRelation } from '@/registry/calculator/lib/dsl/parser'
import { preflight } from '@/registry/calculator/lib/solver/preflight'

describe('solver preflight', () => {
  it('allows equation count equal to distinct unknown count', () => {
    expect(preflight([parseRelation('x+y=2'), parseRelation('x-y=0')])).toEqual({
      ok: true,
      equationCount: 2,
      variableCount: 2,
    })
  })

  it('enforces the strict rule even for a constant equation', () => {
    expect(preflight([parseRelation('1=1')])).toEqual({
      ok: false,
      status: 'overdefined',
      equationCount: 1,
      variableCount: 0,
      message: '1 equation exceeds 0 distinct unknowns.',
    })
  })

  it('does not count query rows as equations or equation variables', () => {
    expect(preflight([parseRelation('x=1'), parseRelation('z^2')])).toEqual({
      ok: true,
      equationCount: 1,
      variableCount: 1,
    })
  })
})
