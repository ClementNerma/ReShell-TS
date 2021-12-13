import { matchUnion } from '../parsers/utils'
import { StatementChain, ValueType } from '../shared/parsed'
import { located, success, TypecheckerArr, TypecheckerErr } from './base'
import { Scope, scopeFirstPass } from './scope/first-pass'
import { ensureScopeUnicity } from './scope/search'
import { resolveExprType } from './types/expr'
import { typeValidator } from './types/validator'

export const statementChainChecker: TypecheckerArr<StatementChain, Scope[], void> = (chain, parents) => {
  const firstPass = scopeFirstPass(chain, parents)
  if (!firstPass.ok) return firstPass

  // 1. Find all declared functions and type alias
  // 2. Discover scope sequentially using the items above

  const scope: Scope = { ...firstPass.data, variables: new Map() }
  const scopes = parents.concat(scope)

  for (const stmt of chain) {
    if (stmt.parsed.type === 'empty') continue

    for (const sub of [stmt.parsed.start].concat(stmt.parsed.sequence.map((c) => c.parsed.chainedStatement))) {
      const subResult: TypecheckerErr | false = matchUnion(sub.parsed)('type', {
        variableDecl: ({ varname, vartype, mutable, expr }) => {
          const unicity = ensureScopeUnicity([varname.parsed, varname.start], { scopes })
          if (!unicity.ok) return unicity

          let expectedType: ValueType | null = null

          if (vartype) {
            const validation = typeValidator(vartype.parsed, scopes)
            if (!validation.ok) return validation

            expectedType = vartype.parsed
          }

          const validation = resolveExprType(expr, scopes)
          if (!validation.ok) return validation

          scope.variables.set(
            varname.parsed,
            located(varname.start, { mutable: mutable.parsed, type: expectedType ?? validation.data })
          )

          return false
        },

        _: () => {
          throw new Error('// TODO: other statement types')
        },
      })

      if (subResult) return subResult
    }
  }

  return success(void 0)
}
