import { describe, expect, test } from 'bun:test'
import { parseRelation } from '@/registry/calculator/lib/dsl/parser'
import { variableRows, workspaceRelations, parseVariable } from '@/registry/calculator/lib/workspace'
import { calculatorReducer } from '@/registry/calculator/lib/reducer'
import { initialCalculatorState, type Relation } from '@/registry/calculator/lib/model'
import type { SolverResult } from '@/registry/calculator/lib/solver/protocol'

const equation = (source: string): Relation => ({ id: source, source, ast: parseRelation(source), createdAt: 0, enabled: true })
const value = (exact: string) => ({ exact, mathml: `<mn>${exact}</mn>` })
const result: SolverResult = { status: 'solved', variables: ['a', 'f', 'm'], solutions: [{ assignments: { a: value('3'), m: value('2'), f: value('6') }, queries: [] }] }

describe('equations and variables', () => {
  test('discovers variables from equations and value-expression dependencies', () => {
    expect(variableRows([equation('F=m*a')], []).map(row => row.name)).toEqual(['a', 'f', 'm'])
    const rows = variableRows([], [{ id: 'v', name: 'speed', source: 'distance / time' }])
    expect(rows.map(row => row.name)).toEqual(['speed', 'distance', 'time'])
    expect(rows.every(row => !row.locked)).toBe(true)
    expect(variableRows([{ ...equation('x=y'), enabled: false }], [])).toEqual([])
  })

  test('keeps supplied expressions editable while locking derived values', () => {
    const inputs = [{ id: 'mass', name: 'm', source: '1+1' }, { id: 'acceleration', name: 'a', source: '3' }]
    const rows = variableRows([equation('F=m*a')], inputs, result)
    expect(rows.find(row => row.name === 'f')).toMatchObject({ locked: true, supplied: false, source: '', values: [value('6')] })
    expect(rows.find(row => row.name === 'm')).toMatchObject({ locked: false, supplied: true, source: '1+1', values: [value('2')] })
    expect(workspaceRelations([equation('F=m*a')], inputs)).toEqual(['F=m*a', 'm=1+1', 'a=3'].map(parseRelation))
  })

  test('clearing an input invalidates locks and ignores stale calculations', () => {
    const state = { ...initialCalculatorState, relations: [equation('F=m*a')], variables: [{ id: 'm', name: 'm', source: '2' }], solver: { phase: 'loading' as const, requestId: 'old' } }
    const cleared = calculatorReducer(state, { type: 'variable-saved', variable: { id: 'm', name: 'm', source: '' } })
    expect(cleared.solver.phase).toBe('idle')
    expect(variableRows(cleared.relations, cleared.variables).every(row => !row.locked)).toBe(true)
    expect(workspaceRelations(cleared.relations, cleared.variables)).toEqual([parseRelation('F=m*a')])
    expect(calculatorReducer(cleared, { type: 'solve-finished', requestId: 'old', result })).toEqual(cleared)
  })

  test('preserves anonymous expressions and solution alternatives without treating them as inputs', () => {
    const alternatives: SolverResult = { status: 'solved', variables: ['x'], solutions: [
      { assignments: { x: value('-2') }, queries: [value('5')] },
      { assignments: { x: value('2') }, queries: [value('5')] },
    ] }
    const inputs = [{ id: 'q', name: '', source: '2+3' }]
    const rows = variableRows([equation('x^2=4')], inputs, alternatives)
    expect(rows[0]).toMatchObject({ name: 'x', locked: true, values: [value('-2'), value('2')] })
    expect(rows[1]).toMatchObject({ source: '2+3', locked: false, values: [value('5'), value('5')] })
    expect(workspaceRelations([equation('x^2=4')], inputs)).toHaveLength(2)
  })

  test('does not mistake object properties for solved variables', () => {
    const rows = variableRows([equation('constructor=x')], [], { status: 'solved', variables: [], solutions: [{ assignments: {}, queries: [] }] })
    expect(rows.every(row => !row.locked && row.values.length === 0)).toBe(true)
  })

  test('validates names and expressions separately', () => {
    expect(parseVariable('Mass', '2*3')).toEqual({ name: 'mass', source: '2*3' })
    expect(parseVariable('', 'sqrt(9)')).toEqual({ name: '', source: 'sqrt(9)' })
    expect(() => parseVariable('2+x', '3')).toThrow('variable name')
    expect(() => parseVariable('x', 'y=3')).toThrow('Equations grid')
  })
})
