import type { BuiltinFunction, ExpressionAst, RelationAst } from '@/registry/calculator/lib/dsl/ast'

type Rendered = { latex: string; precedence: number }

const PRECEDENCE = {
  additive: 1,
  multiplicative: 2,
  unary: 3,
  power: 4,
  factorial: 5,
  atom: 6,
} as const

const NAMED_FUNCTIONS: Partial<Record<BuiltinFunction, string>> = {
  exp: 'exp',
  ln: 'ln',
  log: 'log',
  sin: 'sin',
  cos: 'cos',
  tan: 'tan',
  asin: 'arcsin',
  acos: 'arccos',
  atan: 'arctan',
  sinh: 'sinh',
  cosh: 'cosh',
  tanh: 'tanh',
}

function group(latex: string): string {
  return `\\left(${latex}\\right)`
}

function escapeSymbol(name: string): string {
  const escaped = name.replaceAll('_', '\\_')
  return name.length === 1 ? escaped : `\\mathit{${escaped}}`
}

function wrapped(rendered: Rendered, minimumPrecedence: number): string {
  return rendered.precedence < minimumPrecedence
    ? group(rendered.latex)
    : rendered.latex
}

function renderCall(name: BuiltinFunction, args: ExpressionAst[]): string {
  const renderedArgs = args.map((argument) => render(argument).latex)
  if (name === 'sqrt') return `\\sqrt{${renderedArgs[0]}}`
  if (name === 'abs') return `\\left|${renderedArgs[0]}\\right|`
  if (name === 'log10') return `\\log_{10}${group(renderedArgs[0])}`
  if (name === 'diff') {
    return `\\frac{d}{d ${renderedArgs[1]}}${group(renderedArgs[0])}`
  }
  if (name === 'integrate') {
    return `\\int ${renderedArgs[0]}\\, d${renderedArgs[1]}`
  }
  if (name === 'limit') {
    return `\\lim_{${renderedArgs[1]} \\to ${renderedArgs[2]}}${group(renderedArgs[0])}`
  }
  if (name === 'simplify' || name === 'expand' || name === 'factor') {
    return `\\operatorname{${name}}${group(renderedArgs[0])}`
  }
  const command = NAMED_FUNCTIONS[name]
  return `\\${command ?? name}${group(renderedArgs[0])}`
}

function render(expression: ExpressionAst): Rendered {
  switch (expression.kind) {
    case 'number':
      return { latex: expression.value, precedence: PRECEDENCE.atom }
    case 'symbol':
      return { latex: escapeSymbol(expression.name), precedence: PRECEDENCE.atom }
    case 'constant':
      return {
        latex: expression.name === 'pi' ? '\\pi' : '\\mathrm{e}',
        precedence: PRECEDENCE.atom,
      }
    case 'unary': {
      const operand = render(expression.operand)
      return {
        latex: `${expression.operator}${wrapped(operand, PRECEDENCE.unary)}`,
        precedence: PRECEDENCE.unary,
      }
    }
    case 'factorial': {
      const operand = render(expression.operand)
      return {
        latex: `${wrapped(operand, PRECEDENCE.factorial)}!`,
        precedence: PRECEDENCE.factorial,
      }
    }
    case 'call':
      return {
        latex: renderCall(expression.name, expression.args),
        precedence: PRECEDENCE.atom,
      }
    case 'binary': {
      const left = render(expression.left)
      const right = render(expression.right)
      if (expression.operator === '+' || expression.operator === '-') {
        const rightLatex =
          expression.operator === '-' && right.precedence <= PRECEDENCE.additive
            ? group(right.latex)
            : right.latex
        return {
          latex: `${wrapped(left, PRECEDENCE.additive)} ${expression.operator} ${rightLatex}`,
          precedence: PRECEDENCE.additive,
        }
      }
      if (expression.operator === '/') {
        return {
          latex: `\\frac{${left.latex}}{${right.latex}}`,
          precedence: PRECEDENCE.multiplicative,
        }
      }
      if (expression.operator === '^') {
        const base =
          left.precedence <= PRECEDENCE.power ? group(left.latex) : left.latex
        return {
          latex: `${base}^{${right.latex}}`,
          precedence: PRECEDENCE.power,
        }
      }
      const separator = expression.implicit ? '' : ' \\cdot '
      return {
        latex: `${wrapped(left, PRECEDENCE.multiplicative)}${separator}${wrapped(right, PRECEDENCE.multiplicative)}`,
        precedence: PRECEDENCE.multiplicative,
      }
    }
  }
}

export function toLatex(expression: ExpressionAst): string {
  return render(expression).latex
}

export function relationToLatex(relation: RelationAst): string {
  return relation.kind === 'equation'
    ? `${toLatex(relation.left)} = ${toLatex(relation.right)}`
    : toLatex(relation.expression)
}
