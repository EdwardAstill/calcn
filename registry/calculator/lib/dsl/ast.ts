export const BUILTIN_ARITY = {
  Norm: 2, N: 2, Pois: 1, Bin: 2, Bern: 1, Unif: 2, Exp: 1,
  Weib: 2, Gamma: 2, Beta: 2, T: 1, Chi2: 1, F: 2,
  P: 1, E: 1, Var: 1, quantile: 2,
  dot: 2, cross: 2, norm: 1, unit: 1, transpose: 1, det: 1, inv: 1,
  trace: 1, rank: 1, linsolve: 2, grad: 2, jacobian: 2, div: 2, curl: 2, hessian: 2,
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

export type ComparisonOperator = '<' | '<=' | '>' | '>=' | '=' | '!='

export type ExpressionAst =
  | { kind: 'array'; items: ExpressionAst[] }
  | { kind: 'comparison'; operands: ExpressionAst[]; operators: ComparisonOperator[] }
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

export function hasMatrixValues(relations: readonly RelationAst[]): boolean {
  const operations = new Set(['dot', 'cross', 'norm', 'unit', 'transpose', 'det', 'inv', 'trace', 'rank', 'linsolve', 'grad', 'jacobian', 'div', 'curl', 'hessian'])
  function visit(node: ExpressionAst): boolean {
    if (node.kind === 'array') return true
    if (node.kind === 'call') return operations.has(node.name) || node.args.some(visit)
    if (node.kind === 'binary') return visit(node.left) || visit(node.right)
    if (node.kind === 'unary' || node.kind === 'factorial') return visit(node.operand)
    if (node.kind === 'comparison') return node.operands.some(visit)
    return false
  }
  return relations.some(row => row.kind === 'query' ? visit(row.expression) : visit(row.left) || visit(row.right))
}
