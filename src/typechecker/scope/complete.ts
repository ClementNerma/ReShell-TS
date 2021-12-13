// 1. Find all declared functions and type alias
// 2. Discover scope sequentially using the items above

import { FnType, StatementChain, ValueType } from '../../parsers/data'
import { err, located, Located, success, TypecheckerArr } from '../base'
import { resolveExprType } from '../expr-type'
import { ScopeFirstPass } from './first-pass'
import { typeValidator } from './type-validator'

export type Scope = {
  typeAliases: Map<string, Located<ValueType>>
  functions: Map<string, Located<FnType>>
  variables: Map<string, Located<{ mutable: boolean; type: ValueType }>>
}

export const completeScope: TypecheckerArr<StatementChain, ScopeFirstPass, Scope> = (chain, scopeFirstPass) => {
  const scope: Scope = { ...scopeFirstPass, variables: new Map() }

  for (const stmt of chain) {
    if (stmt.parsed.type === 'empty') continue

    for (const sub of [stmt.parsed.start].concat(stmt.parsed.sequence.map((c) => c.parsed.chainedStatement))) {
      switch (sub.parsed.type) {
        case 'variableDecl':
          const varname = sub.parsed.varname.parsed

          const existing = scope.variables.get(varname)

          if (existing) {
            return err(
              {
                error: {
                  message: 'A variable with this name was already declared in this scope',
                  length: varname.length,
                },
                also: [
                  {
                    loc: existing.loc,
                    length: varname.length,
                    message: 'Original declaration occurs here',
                    complements: [],
                  },
                ],
              },
              sub.parsed.varname.start
            )
          }

          let vartype: ValueType

          if (sub.parsed.vartype) {
            console.dir(sub.parsed.vartype, { depth: null })
            const validation = typeValidator(sub.parsed.vartype.parsed, scope)
            if (!validation.ok) return validation

            vartype = sub.parsed.vartype.parsed
          } else {
            const validation = resolveExprType(sub.parsed.expr, scope)
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
