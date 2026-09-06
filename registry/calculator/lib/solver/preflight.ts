import { collectEquationSymbols } from '@/registry/calculator/lib/dsl/analyze'
import type { RelationAst } from '@/registry/calculator/lib/dsl/ast'

export type PreflightResult =
  | { ok: true; equationCount: number; variableCount: number }
  | {
      ok: false
      status: 'overdefined'
      equationCount: number
      variableCount: number
      message: string
    }

export function preflight(relations: RelationAst[]): PreflightResult {
  const equationCount = relations.filter(
    (relation) => relation.kind === 'equation',
  ).length
  const variableCount = collectEquationSymbols(relations).length

  if (equationCount > variableCount) {
    return {
      ok: false,
      status: 'overdefined',
      equationCount,
      variableCount,
      message: `${equationCount} equation${equationCount === 1 ? '' : 's'} exceeds ${variableCount} distinct unknowns.`,
    }
  }

  return { ok: true, equationCount, variableCount }
}
