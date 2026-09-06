import {
  initialCalculatorState,
  type CalculatorAction,
  type CalculatorState,
  type Relation,
} from '@/registry/calculator/lib/model'

function idleSolver(): CalculatorState['solver'] {
  return { phase: 'idle' }
}

export function calculatorReducer(
  state: CalculatorState,
  action: CalculatorAction,
): CalculatorState {
  switch (action.type) {
    case 'source-changed':
      return { ...state, source: action.source }
    case 'save': {
      if (state.editingId) {
        return {
          ...state,
          source: '',
          editingId: null,
          solver: idleSolver(),
          relations: state.relations.map((relation) =>
            relation.id === state.editingId
              ? { ...relation, source: action.source, ast: action.ast }
              : relation,
          ),
        }
      }
      const relation: Relation = {
        id: action.id,
        source: action.source,
        ast: action.ast,
        createdAt: action.now,
        enabled: true,
      }
      return {
        ...state,
        source: '',
        relations: [...state.relations, relation],
        solver: idleSolver(),
      }
    }
    case 'edit': {
      const relation = state.relations.find((row) => row.id === action.id)
      return relation
        ? { ...state, source: relation.source, editingId: relation.id }
        : state
    }
    case 'delete': {
      const deletingEditedRow = state.editingId === action.id
      return {
        ...state,
        relations: state.relations.filter((relation) => relation.id !== action.id),
        source: deletingEditedRow ? '' : state.source,
        editingId: deletingEditedRow ? null : state.editingId,
        solver: idleSolver(),
      }
    }
    case 'enabled-changed':
      return {
        ...state,
        relations: state.relations.map((relation) =>
          relation.id === action.id
            ? { ...relation, enabled: action.enabled }
            : relation,
        ),
        solver: idleSolver(),
      }
    case 'clear-editor':
      return { ...state, source: '', editingId: null }
    case 'clear-all':
      return { ...initialCalculatorState, helpOpen: state.helpOpen }
    case 'help-changed':
      return { ...state, helpOpen: action.open }
    case 'local-diagnostic':
      return {
        ...state,
        solver: {
          phase: 'diagnostic',
          code: action.code,
          message: action.message,
        },
      }
    case 'solve-started':
      return { ...state, solver: { phase: 'loading', requestId: action.requestId } }
    case 'solve-finished':
      return state.solver.phase === 'loading' &&
        state.solver.requestId === action.requestId
        ? {
            ...state,
            solver: {
              phase: 'complete',
              requestId: action.requestId,
              result: action.result,
            },
          }
        : state
  }
}
