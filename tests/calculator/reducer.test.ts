import { describe, expect, it } from 'bun:test'
import { parseRelation } from '@/registry/calculator/lib/dsl/parser'
import { initialCalculatorState } from '@/registry/calculator/lib/model'
import { calculatorReducer } from '@/registry/calculator/lib/reducer'

describe('calculatorReducer', () => {
  it('saves an edit in place without duplicating or reordering', () => {
    const added = calculatorReducer(initialCalculatorState, {
      type: 'save',
      id: 'r1',
      source: 'x=1',
      ast: parseRelation('x=1'),
      now: 1,
    })
    const withSecond = calculatorReducer(added, {
      type: 'save',
      id: 'r2',
      source: 'x^2',
      ast: parseRelation('x^2'),
      now: 2,
    })
    const editing = calculatorReducer(withSecond, { type: 'edit', id: 'r1' })
    const saved = calculatorReducer(editing, {
      type: 'save',
      id: 'unused',
      source: 'x=2',
      ast: parseRelation('x=2'),
      now: 3,
    })

    expect(saved.relations).toHaveLength(2)
    expect(saved.relations[0]).toMatchObject({
      id: 'r1',
      source: 'x=2',
      createdAt: 1,
    })
    expect(saved.relations[1].id).toBe('r2')
    expect(saved.editingId).toBeNull()
    expect(saved.source).toBe('')
  })

  it('deleting the row being edited also clears the editor', () => {
    const added = calculatorReducer(initialCalculatorState, {
      type: 'save',
      id: 'r1',
      source: 'x=1',
      ast: parseRelation('x=1'),
      now: 1,
    })
    const editing = calculatorReducer(added, { type: 'edit', id: 'r1' })

    expect(calculatorReducer(editing, { type: 'delete', id: 'r1' })).toMatchObject({
      relations: [],
      editingId: null,
      source: '',
      solver: { phase: 'idle' },
    })
  })

  it('clear editor exits edit mode without deleting rows', () => {
    const added = calculatorReducer(initialCalculatorState, {
      type: 'save',
      id: 'r1',
      source: 'x=1',
      ast: parseRelation('x=1'),
      now: 1,
    })
    const editing = calculatorReducer(added, { type: 'edit', id: 'r1' })
    const cleared = calculatorReducer(editing, { type: 'clear-editor' })

    expect(cleared.relations).toHaveLength(1)
    expect(cleared).toMatchObject({ source: '', editingId: null })
  })

  it('ignores a solver response whose request id is stale', () => {
    const pending = calculatorReducer(initialCalculatorState, {
      type: 'solve-started',
      requestId: 'new',
    })
    const received = calculatorReducer(pending, {
      type: 'solve-finished',
      requestId: 'old',
      result: { status: 'no-solution', message: 'No real solution.' },
    })

    expect(received.solver).toEqual(pending.solver)
  })
})
