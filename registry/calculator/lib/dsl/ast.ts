export const BUILTIN_ARITY = {
  sqrt: 1,
  abs: 1,
  exp: 1,
  ln: 1,
  log: 1,
  log10: 1,
  sin: 1,
  cos: 1,
  tan: 1,
  asin: 1,
  acos: 1,
  atan: 1,
  sinh: 1,
  cosh: 1,
  tanh: 1,
  simplify: 1,
  expand: 1,
  factor: 1,
  diff: 2,
  integrate: 2,
  limit: 3,
} as const

export type BuiltinFunction = keyof typeof BUILTIN_ARITY

export type ExpressionAst =
  | { kind: 'number'; value: string }
  | { kind: 'symbol'; name: string }
  | { kind: 'constant'; name: 'pi' | 'e' }
  | { kind: 'unary'; operator: '+' | '-'; operand: ExpressionAst }
  | {
      kind: 'binary'
      operator: '+' | '-' | '*' | '/' | '^'
      left: ExpressionAst
      right: ExpressionAst
      implicit?: boolean
    }
  | { kind: 'factorial'; operand: ExpressionAst }
  | { kind: 'call'; name: BuiltinFunction; args: ExpressionAst[] }

export type RelationAst =
  | { kind: 'equation'; left: ExpressionAst; right: ExpressionAst }
  | { kind: 'query'; expression: ExpressionAst }

export function isBuiltinFunction(name: string): name is BuiltinFunction {
  return Object.hasOwn(BUILTIN_ARITY, name)
}
