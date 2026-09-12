export type OperationItem = {
  id: string
  label: string
  template: string
  shortcut: string
}

export type OperationGroup = {
  name: 'Arithmetic' | 'Scientific' | 'Algebra' | 'Calculus' | 'Probability'
  shortcut: string
  items: OperationItem[]
}

export const OPERATION_GROUPS: OperationGroup[] = [
  {
    name: 'Arithmetic',
    shortcut: 'r',
    items: [
      { id: 'add', shortcut: 'p', label: '+', template: '□ + ' },
      { id: 'subtract', shortcut: 's', label: '−', template: '□ - ' },
      { id: 'multiply', shortcut: 'm', label: '×', template: '□ * ' },
      { id: 'divide', shortcut: 'd', label: '÷', template: '□ / ' },
      { id: 'power', shortcut: 'e', label: 'xʸ', template: '(□)^2' },
      { id: 'sqrt', shortcut: 'r', label: '√', template: 'sqrt(□)' },
      { id: 'factorial', shortcut: 'f', label: 'n!', template: '(□)!' },
      { id: 'parentheses', shortcut: 'b', label: '( )', template: '(□)' },
    ],
  },
  {
    name: 'Scientific',
    shortcut: 's',
    items: [
      { id: 'sin', shortcut: 's', label: 'sin', template: 'sin(□)' },
      { id: 'cos', shortcut: 'c', label: 'cos', template: 'cos(□)' },
      { id: 'tan', shortcut: 't', label: 'tan', template: 'tan(□)' },
      { id: 'asin', shortcut: 'a', label: 'sin⁻¹', template: 'asin(□)' },
      { id: 'acos', shortcut: 'o', label: 'cos⁻¹', template: 'acos(□)' },
      { id: 'atan', shortcut: 'r', label: 'tan⁻¹', template: 'atan(□)' },
      { id: 'sinh', shortcut: 'h', label: 'sinh', template: 'sinh(□)' },
      { id: 'cosh', shortcut: 'j', label: 'cosh', template: 'cosh(□)' },
      { id: 'tanh', shortcut: 'k', label: 'tanh', template: 'tanh(□)' },
      { id: 'ln', shortcut: 'n', label: 'ln', template: 'ln(□)' },
      { id: 'log', shortcut: 'l', label: 'log', template: 'log(□)' },
      { id: 'log10', shortcut: 'g', label: 'log₁₀', template: 'log10(□)' },
      { id: 'exp', shortcut: 'x', label: 'eˣ', template: 'exp(□)' },
      { id: 'abs', shortcut: 'b', label: '|x|', template: 'abs(□)' },
      { id: 'pi', shortcut: 'p', label: 'π', template: 'pi' },
      { id: 'e', shortcut: 'e', label: 'e', template: 'e' },
    ],
  },
  {
    name: 'Algebra',
    shortcut: 'a',
    items: [
      { id: 'simplify', shortcut: 's', label: 'Simplify', template: 'simplify(□)' },
      { id: 'expand', shortcut: 'e', label: 'Expand', template: 'expand(□)' },
      { id: 'factor', shortcut: 'f', label: 'Factor', template: 'factor(□)' },
    ],
  },
  {
    name: 'Calculus',
    shortcut: 'c',
    items: [
      { id: 'diff', shortcut: 'd', label: 'Derivative', template: 'diff(□, x)' },
      { id: 'integrate', shortcut: 'i', label: 'Integral', template: 'integrate(□, x)' },
      { id: 'limit', shortcut: 'l', label: 'Limit', template: 'limit(□, x, 0)' },
    ],
  },
  {
    name: 'Probability',
    shortcut: 'p',
    items: [
      { id: 'P', shortcut: 'p', label: 'Probability', template: 'P(□)' },
      { id: 'E', shortcut: 'e', label: 'Expected value', template: 'E(□)' },
      { id: 'Var', shortcut: 'v', label: 'Variance', template: 'Var(□)' },
      { id: 'quantile', shortcut: 'q', label: 'Quantile', template: 'quantile(□, 0.95)' },
      { id: 'Norm', shortcut: 'n', label: 'Normal', template: 'Norm(□, 1)' },
      { id: 'Pois', shortcut: 'o', label: 'Poisson', template: 'Pois(□)' },
      { id: 'Bin', shortcut: 'b', label: 'Binomial', template: 'Bin(□, 0.5)' },
      { id: 'Bern', shortcut: 'r', label: 'Bernoulli', template: 'Bern(□)' },
      { id: 'Unif', shortcut: 'u', label: 'Uniform', template: 'Unif(□, 1)' },
      { id: 'Exp', shortcut: 'x', label: 'Exponential', template: 'Exp(□)' },
      { id: 'Weib', shortcut: 'w', label: 'Weibull', template: 'Weib(□, 1)' },
      { id: 'Gamma', shortcut: 'g', label: 'Gamma', template: 'Gamma(□, 1)' },
      { id: 'Beta', shortcut: 'a', label: 'Beta', template: 'Beta(□, 1)' },
      { id: 'T', shortcut: 't', label: 'Student’s t', template: 'T(□)' },
      { id: 'Chi2', shortcut: 'c', label: 'Chi-squared', template: 'Chi2(□)' },
      { id: 'F', shortcut: 'f', label: 'Fisher’s F', template: 'F(□, 1)' },
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
