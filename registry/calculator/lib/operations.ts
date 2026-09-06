export type OperationItem = {
  id: string
  label: string
  template: string
}

export type OperationGroup = {
  name: 'Arithmetic' | 'Scientific' | 'Algebra' | 'Calculus'
  items: OperationItem[]
}

export const OPERATION_GROUPS: OperationGroup[] = [
  {
    name: 'Arithmetic',
    items: [
      { id: 'add', label: '+', template: '□ + ' },
      { id: 'subtract', label: '−', template: '□ - ' },
      { id: 'multiply', label: '×', template: '□ * ' },
      { id: 'divide', label: '÷', template: '□ / ' },
      { id: 'power', label: 'xʸ', template: '(□)^2' },
      { id: 'sqrt', label: '√', template: 'sqrt(□)' },
      { id: 'factorial', label: 'n!', template: '(□)!' },
      { id: 'parentheses', label: '( )', template: '(□)' },
    ],
  },
  {
    name: 'Scientific',
    items: [
      { id: 'sin', label: 'sin', template: 'sin(□)' },
      { id: 'cos', label: 'cos', template: 'cos(□)' },
      { id: 'tan', label: 'tan', template: 'tan(□)' },
      { id: 'asin', label: 'sin⁻¹', template: 'asin(□)' },
      { id: 'acos', label: 'cos⁻¹', template: 'acos(□)' },
      { id: 'atan', label: 'tan⁻¹', template: 'atan(□)' },
      { id: 'sinh', label: 'sinh', template: 'sinh(□)' },
      { id: 'cosh', label: 'cosh', template: 'cosh(□)' },
      { id: 'tanh', label: 'tanh', template: 'tanh(□)' },
      { id: 'ln', label: 'ln', template: 'ln(□)' },
      { id: 'log', label: 'log', template: 'log(□)' },
      { id: 'log10', label: 'log₁₀', template: 'log10(□)' },
      { id: 'exp', label: 'eˣ', template: 'exp(□)' },
      { id: 'abs', label: '|x|', template: 'abs(□)' },
      { id: 'pi', label: 'π', template: 'pi' },
      { id: 'e', label: 'e', template: 'e' },
    ],
  },
  {
    name: 'Algebra',
    items: [
      { id: 'simplify', label: 'Simplify', template: 'simplify(□)' },
      { id: 'expand', label: 'Expand', template: 'expand(□)' },
      { id: 'factor', label: 'Factor', template: 'factor(□)' },
    ],
  },
  {
    name: 'Calculus',
    items: [
      { id: 'diff', label: 'Derivative', template: 'diff(□, x)' },
      { id: 'integrate', label: 'Integral', template: 'integrate(□, x)' },
      { id: 'limit', label: 'Limit', template: 'limit(□, x, 0)' },
    ],
  },
]

export type TextSelection = { start: number; end: number }

export function applyInsertion(
  source: string,
  selection: TextSelection,
  template: string,
): { source: string; selection: TextSelection } {
  const start = Math.max(0, Math.min(selection.start, selection.end, source.length))
  const end = Math.max(start, Math.min(Math.max(selection.start, selection.end), source.length))
  const selected = source.slice(start, end)
  const slot = template.indexOf('□')
  const replacement = slot >= 0 ? template.replace('□', selected) : template
  const nextSource = source.slice(0, start) + replacement + source.slice(end)
  const cursor =
    slot >= 0 && selected.length === 0 ? start + slot : start + replacement.length

  return {
    source: nextSource,
    selection: { start: cursor, end: cursor },
  }
}
