import { StatementChain, Token, ValueType } from '../shared/parsed'
import { matchUnion } from '../shared/utils'
import { located, Scope, success, Typechecker, TypecheckerErr } from './base'
import { scopeFirstPass } from './scope/first-pass'
import { ensureScopeUnicity } from './scope/search'
import { resolveExprType } from './types/expr'
import { typeValidator } from './types/validator'

export const statementChainChecker: Typechecker<Token<StatementChain>[], void> = (chain, ctx) => {
  const firstPass = scopeFirstPass(chain, ctx)
  if (!firstPass.ok) return firstPass

  // 1. Find all declared functions and type alias
  // 2. Discover scope sequentially using the items above

  const scope: Scope = { ...firstPass.data, variables: new Map() }
  const scopes = ctx.scopes.concat(scope)

  for (const stmt of chain) {
    if (stmt.parsed.type === 'empty') continue

    for (const sub of [stmt.parsed.start].concat(stmt.parsed.sequence.map((c) => c.parsed.chainedStatement))) {
      const subResult: TypecheckerErr | false = matchUnion(sub.parsed)('type', {
        variableDecl: ({ varname, vartype, mutable, expr }) => {
          const unicity = ensureScopeUnicity({ name: varname }, { ...ctx, scopes })
          if (!unicity.ok) return unicity

          let expectedType: ValueType | null = null

          if (vartype) {
            const validation = typeValidator(vartype.parsed, { ...ctx, scopes })
            if (!validation.ok) return validation

            expectedType = vartype.parsed
          }

          const validation = resolveExprType(expr, { scopes, expectedType: expectedType ?? null })
          if (!validation.ok) return validation

          scope.variables.set(varname.parsed, located(varname.at, { mutable: mutable.parsed, type: validation.data }))

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
