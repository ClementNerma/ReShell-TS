// 1. Find all declared functions and type alias
// 2. Discover scope sequentially using the items above

import { FnType, StatementChain, ValueType } from '../../shared/parsed'
import { located, Located, success, TypecheckerArr } from '../base'
import { resolveExprType } from '../expr-type'
import { ScopeFirstPass } from './first-pass'
import { ensureScopeUnicity } from './search'
import { typeValidator } from './type-validator'

export type Scope = {
  typeAliases: Map<string, ScopeTypeAlias>
  functions: Map<string, ScopeFn>
  variables: Map<string, ScopeVar>
}

export type ScopeTypeAlias = Located<ValueType>
export type ScopeFn = Located<FnType>
export type ScopeVar = Located<{ mutable: boolean; type: ValueType }>

export const completeScope: TypecheckerArr<StatementChain, { parents: Scope[]; firstPass: ScopeFirstPass }, Scope> = (
  chain,
  { parents, firstPass }
) => {
  const scope: Scope = { ...firstPass, variables: new Map() }
  const scopes = parents.concat(scope)

  for (const stmt of chain) {
    if (stmt.parsed.type === 'empty') continue

    for (const sub of [stmt.parsed.start].concat(stmt.parsed.sequence.map((c) => c.parsed.chainedStatement))) {
      switch (sub.parsed.type) {
        case 'variableDecl':
          const varname = sub.parsed.varname.parsed

          const unicity = ensureScopeUnicity([varname, sub.parsed.varname.start], { scopes })
          if (!unicity.ok) return unicity

          let vartype: ValueType

          if (sub.parsed.vartype) {
            console.dir(sub.parsed.vartype, { depth: null })
            const validation = typeValidator(sub.parsed.vartype.parsed, scopes)
            if (!validation.ok) return validation

            vartype = sub.parsed.vartype.parsed
          } else {
            const validation = resolveExprType(sub.parsed.expr, scopes)
            if (!validation.ok) return validation

            vartype = validation.data
          }

          scope.variables.set(
            varname,
            located(sub.parsed.varname.start, { mutable: sub.parsed.mutable.parsed, type: vartype })
          )

          break

        default:
          throw new Error('// TODO: other statement types')
        // assertUnreachable(sub.parsed.type)
      }
    }
  }

  return success(scope)
}
