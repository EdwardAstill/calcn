import { BUILTIN_ARITY } from '@/registry/calculator/lib/dsl/ast'
import { DISTRIBUTIONS } from '@/registry/calculator/lib/distributions'

const signatures: Record<string, readonly string[]> = {
  ...DISTRIBUTIONS,
  dot: ['u', 'v'], cross: ['u', 'v'], norm: ['vector'], unit: ['vector'],
  transpose: ['matrix'], det: ['matrix'], inv: ['matrix'], trace: ['matrix'], rank: ['matrix'], linsolve: ['matrix', 'vector'],
  grad: ['expression', 'variables'], jacobian: ['vector', 'variables'], div: ['vector', 'variables'], curl: ['vector', 'variables'], hessian: ['expression', 'variables'],
  P: ['event'], E: ['variable'], Var: ['variable'], quantile: ['variable', 'probability'],
  diff: ['expression', 'variable'], integrate: ['expression', 'variable'], limit: ['expression', 'variable', 'point'],
}
for (const name of Object.keys(BUILTIN_ARITY)) signatures[name] ??= ['expression']

export type Completion = { suffix: string; insertion: string; replaceFrom: number; signature: string }
export function completeFunction(source: string, caret: number): Completion | null {
  if (caret !== source.length) return null
  const prefix = source.match(/[A-Za-z][A-Za-z0-9]*$/)?.[0]
  if (!prefix) return null
  const names = Object.keys(signatures)
  const name = names.find(name => name === prefix) ?? names.find(name => name.startsWith(prefix)) ?? names.find(name => name.toLowerCase().startsWith(prefix.toLowerCase()))
  if (!name) return null
  const suffix = name.slice(prefix.length)
  return { suffix: `${suffix}(${signatures[name].join(', ')})`, insertion: `${name}(`, replaceFrom: source.length - prefix.length, signature: `${name}(${signatures[name].join(', ')})` }
}

export function functionHint(source: string, caret: number): string | null {
  const stack: { name: string; argument: number }[] = []
  const before = source.slice(0, caret)
  for (let i = 0; i < before.length; i++) {
    if (before[i] === '(' || before[i] === '{' || before[i] === '[') stack.push({ name: before.slice(0, i).match(/[A-Za-z][A-Za-z0-9]*$/)?.[0] ?? '', argument: 0 })
    else if (before[i] === ')' || before[i] === '}' || before[i] === ']') stack.pop()
    else if (before[i] === ',' && stack.length) stack[stack.length - 1].argument++
  }
  const current = stack.findLast(entry => entry.name !== '')
  if (!current) return null
  const args = signatures[current.name] ?? signatures[current.name.toLowerCase()]
  return args ? `${current.name}(${args.join(', ')}) — ${args[current.argument] ?? 'close with )'}` : null
}
