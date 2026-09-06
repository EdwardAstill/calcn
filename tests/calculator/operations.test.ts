import { describe, expect, it } from 'bun:test'
import { applyInsertion, OPERATION_GROUPS } from '@/registry/calculator/lib/operations'

describe('operation insertion', () => {
  it('wraps a selected expression and places the cursor after the template', () => {
    expect(
      applyInsertion('x+1', { start: 0, end: 3 }, 'sqrt(□)'),
    ).toEqual({
      source: 'sqrt(x+1)',
      selection: { start: 9, end: 9 },
    })
  })

  it('selects the empty slot when no text is selected', () => {
    expect(applyInsertion('', { start: 0, end: 0 }, 'diff(□, x)')).toEqual({
      source: 'diff(, x)',
      selection: { start: 5, end: 5 },
    })
  })

  it('replaces a selection for templates without a slot', () => {
    expect(applyInsertion('x+1', { start: 0, end: 3 }, 'pi')).toEqual({
      source: 'pi',
      selection: { start: 2, end: 2 },
    })
  })

  it('provides arithmetic, scientific, algebra, and calculus groups', () => {
    expect(OPERATION_GROUPS.map((group) => group.name)).toEqual([
      'Arithmetic',
      'Scientific',
      'Algebra',
      'Calculus',
    ])
  })
})
