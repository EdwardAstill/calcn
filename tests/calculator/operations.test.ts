import { describe, expect, it } from 'bun:test'
import { applyInsertion, OPERATION_GROUPS } from '@/registry/calculator/lib/operations'
import { parseRelation } from '@/registry/calculator/lib/dsl/parser'
import { prepareProbability } from '@/registry/calculator/lib/probability'

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

  it('provides all operation groups', () => {
    expect(OPERATION_GROUPS.map((group) => group.name)).toEqual([
      'Arithmetic',
      'Scientific',
      'Algebra',
      'Calculus',
      'Probability',
    ])
  })

  it('assigns unique two-key shortcuts to every operation', () => {
    expect(new Set(OPERATION_GROUPS.map(group => group.shortcut)).size).toBe(OPERATION_GROUPS.length)
    for (const group of OPERATION_GROUPS) {
      expect(group.shortcut).toMatch(/^[a-z]$/)
      expect(new Set(group.items.map(item => item.shortcut)).size).toBe(group.items.length)
      for (const item of group.items) expect(item.shortcut).toMatch(/^[a-z]$/)
    }
    const arithmetic = OPERATION_GROUPS.find(group => group.shortcut === 'r')!
    expect(arithmetic.items.find(item => item.shortcut === 'p')?.id).toBe('add')
    expect(arithmetic.items.find(item => item.shortcut === 's')?.id).toBe('subtract')
  })

  it('inserts probability templates that can be evaluated by the calculator', () => {
    const group = OPERATION_GROUPS.find(group => group.name === 'Probability')!
    for (const item of group.items) {
      const selected = item.id === 'P' ? 'Norm(0, 1) < 0'
        : ['E', 'Var', 'quantile'].includes(item.id) ? 'Norm(0, 1)'
        : ['Norm', 'Unif'].includes(item.id) ? '0' : '1'
      const { source } = applyInsertion(selected, { start: 0, end: selected.length }, item.template)
      const relation = ['P', 'E', 'Var', 'quantile'].includes(item.id) ? source : `X = ${source}`
      expect(prepareProbability([parseRelation(relation)]).result?.status).toBe('solved')
      const empty = applyInsertion('', { start: 0, end: 0 }, item.template)
      expect(empty.selection.start).toBe(item.template.indexOf('□'))
    }
  })
})
