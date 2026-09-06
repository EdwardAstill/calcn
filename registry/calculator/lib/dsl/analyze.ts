import type { ExpressionAst, RelationAst } from '@/registry/calculator/lib/dsl/ast'

const CALCULUS_BINDING_INDEX = new Map([
  ['diff', 1],
  ['integrate', 1],
  ['limit', 1],
])

export function collectFreeSymbols(expression: ExpressionAst): Set<string> {
  const symbols = new Set<string>()

  function visit(node: ExpressionAst): void {
    switch (node.kind) {
      case 'number':
      case 'constant':
        return
      case 'symbol':
        symbols.add(node.name.toLowerCase())
        return
      case 'unary':
      case 'factorial':
        visit(node.operand)
        return
      case 'binary':
        visit(node.left)
        visit(node.right)
        return
      case 'call': {
        const boundIndex = CALCULUS_BINDING_INDEX.get(node.name)
        node.args.forEach((argument, index) => {
          if (index !== boundIndex) visit(argument)
        })
      }
    }
  }

  visit(expression)
  return symbols
}

export function collectEquationSymbols(relations: RelationAst[]): string[] {
  const symbols = new Set<string>()

  for (const relation of relations) {
    if (relation.kind !== 'equation') continue
    for (const symbol of collectFreeSymbols(relation.left)) symbols.add(symbol)
    for (const symbol of collectFreeSymbols(relation.right)) symbols.add(symbol)
  }

  return [...symbols].sort((left, right) => left.localeCompare(right))
}
