import type { BuiltinFunction, ExpressionAst, RelationAst } from '@/registry/calculator/lib/dsl/ast'

type Rendered = { mathml: string; precedence: number }

const PRECEDENCE = {
  additive: 1,
  multiplicative: 2,
  unary: 3,
  power: 4,
  factorial: 5,
  atom: 6,
} as const

const FUNCTION_LABELS: Partial<Record<BuiltinFunction, string>> = {
  asin: 'arcsin',
  acos: 'arccos',
  atan: 'arctan',
  log10: 'log',
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

function row(...children: string[]): string {
  return `<mrow>${children.join('')}</mrow>`
}

function operator(value: string): string {
  return `<mo>${value}</mo>`
}

function identifier(value: string): string {
  return `<mi>${escapeXml(value)}</mi>`
}

function group(mathml: string): string {
  return row(operator('('), mathml, operator(')'))
}

function wrapped(rendered: Rendered, minimumPrecedence: number): string {
  return rendered.precedence < minimumPrecedence
    ? group(rendered.mathml)
    : rendered.mathml
}

function applyFunction(label: string, argument: string): string {
  return row(identifier(label), operator('&#x2061;'), group(argument))
}

function renderCall(name: BuiltinFunction, args: ExpressionAst[]): string {
  const renderedArgs = args.map((argument) => render(argument).mathml)
  if (name === 'sqrt') return `<msqrt>${renderedArgs[0]}</msqrt>`
  if (name === 'abs') return row(operator('|'), renderedArgs[0], operator('|'))
  if (name === 'log10') {
    return row(
      `<msub>${identifier('log')}<mn>10</mn></msub>`,
      operator('&#x2061;'),
      group(renderedArgs[0]),
    )
  }
  if (name === 'diff') {
    return row(
      `<mfrac>${identifier('d')}${row(identifier('d'), renderedArgs[1])}</mfrac>`,
      group(renderedArgs[0]),
    )
  }
  if (name === 'integrate') {
    return row(
      operator('&#x222B;'),
      renderedArgs[0],
      operator('&#x2062;'),
      identifier('d'),
      renderedArgs[1],
    )
  }
  if (name === 'limit') {
    return row(
      `<munder>${identifier('lim')}${row(renderedArgs[1], operator('&#x2192;'), renderedArgs[2])}</munder>`,
      group(renderedArgs[0]),
    )
  }
  return applyFunction(FUNCTION_LABELS[name] ?? name, renderedArgs[0])
}

function render(expression: ExpressionAst): Rendered {
  switch (expression.kind) {
    case 'number':
      return {
        mathml: `<mn>${escapeXml(expression.value)}</mn>`,
        precedence: PRECEDENCE.atom,
      }
    case 'symbol':
      return { mathml: identifier(expression.name), precedence: PRECEDENCE.atom }
    case 'constant':
      return {
        mathml: identifier(expression.name === 'pi' ? 'π' : 'e'),
        precedence: PRECEDENCE.atom,
      }
    case 'unary': {
      const operand = render(expression.operand)
      return {
        mathml: row(operator(expression.operator), wrapped(operand, PRECEDENCE.unary)),
        precedence: PRECEDENCE.unary,
      }
    }
    case 'factorial': {
      const operand = render(expression.operand)
      return {
        mathml: row(wrapped(operand, PRECEDENCE.factorial), operator('!')),
        precedence: PRECEDENCE.factorial,
      }
    }
    case 'call':
      return {
        mathml: renderCall(expression.name, expression.args),
        precedence: PRECEDENCE.atom,
      }
    case 'binary': {
      const left = render(expression.left)
      const right = render(expression.right)
      if (expression.operator === '+' || expression.operator === '-') {
        const rightMathml =
          expression.operator === '-' && right.precedence <= PRECEDENCE.additive
            ? group(right.mathml)
            : right.mathml
        return {
          mathml: row(
            wrapped(left, PRECEDENCE.additive),
            operator(expression.operator),
            rightMathml,
          ),
          precedence: PRECEDENCE.additive,
        }
      }
      if (expression.operator === '/') {
        return {
          mathml: `<mfrac>${left.mathml}${right.mathml}</mfrac>`,
          precedence: PRECEDENCE.multiplicative,
        }
      }
      if (expression.operator === '^') {
        const base =
          left.precedence <= PRECEDENCE.power
            ? group(left.mathml)
            : left.mathml
        return {
          mathml: `<msup>${base}${right.mathml}</msup>`,
          precedence: PRECEDENCE.power,
        }
      }
      return {
        mathml: row(
          wrapped(left, PRECEDENCE.multiplicative),
          operator(expression.implicit ? '&#x2062;' : '&#x22C5;'),
          wrapped(right, PRECEDENCE.multiplicative),
        ),
        precedence: PRECEDENCE.multiplicative,
      }
    }
  }
}

export function toMathMl(expression: ExpressionAst): string {
  return `<math xmlns="http://www.w3.org/1998/Math/MathML">${render(expression).mathml}</math>`
}

export function relationToMathMl(relation: RelationAst): string {
  const content =
    relation.kind === 'equation'
      ? row(render(relation.left).mathml, operator('='), render(relation.right).mathml)
      : render(relation.expression).mathml
  return `<math xmlns="http://www.w3.org/1998/Math/MathML">${content}</math>`
}
