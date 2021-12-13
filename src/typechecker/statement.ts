import { StatementChain, Token, ValueType } from '../shared/parsed'
import { matchUnion } from '../shared/utils'
import { err, located, Scope, success, Typechecker, TypecheckerResult } from './base'
import { scopeFirstPass } from './scope/first-pass'
import { getVariableInScope } from './scope/search'
import { buildExprDoubleOp, resolveDoubleOpType } from './types/double-op'
import { resolveExprType } from './types/expr'
import { resolvePropAccessType } from './types/propaccess'
import { typeValidator } from './types/validator'

export const statementChainChecker: Typechecker<Token<StatementChain>[], void> = (chain, ctx) => {
  const firstPass = scopeFirstPass(chain, ctx)
  if (!firstPass.ok) return firstPass

  // 1. Find all declared functions and type alias
  // 2. Discover scope sequentially using the items above

  const scope: Scope = { ...firstPass.data, variables: new Map() }
  const scopes = ctx.scopes.concat(scope)

  ctx = { ...ctx, scopes }

  for (const stmt of chain) {
    if (stmt.parsed.type === 'empty') continue

    for (const sub of [stmt.parsed.start].concat(stmt.parsed.sequence.map((c) => c.parsed.chainedStatement))) {
      const subResult: TypecheckerResult<void> = matchUnion(sub.parsed, 'type', {
        variableDecl: ({ varname, vartype, mutable, expr }): TypecheckerResult<void> => {
          // const unicity = ensureScopeUnicity({ name: varname }, ctx)
          // if (!unicity.ok) return unicity

          let expectedType: ValueType | null = null

          if (vartype) {
            const validation = typeValidator(vartype.parsed, ctx)
            if (!validation.ok) return validation

            expectedType = vartype.parsed
          }

          const validation = resolveExprType(expr, {
            ...ctx,
            scopes,
            typeExpectation: expectedType
              ? {
                  type: expectedType,
                  from: vartype!.at,
                }
              : null,
          })
          if (!validation.ok) return validation

          scope.variables.set(
            varname.parsed,
            located(varname.at, { mutable: mutable.parsed, type: expectedType ?? validation.data })
          )

          return success(void 0)
        },

        assignment: ({ varname, propAccesses, prefixOp, expr }) => {
          const tryScopedVar = getVariableInScope(varname, ctx)
          if (!tryScopedVar.ok) return tryScopedVar

          const { content: scopedVar } = tryScopedVar.data

          if (!scopedVar.mutable) {
            return err(varname.at, {
              message: `cannot assign to non-mutable variable \`${varname.parsed}\``,
              complements: [
                ['Tip', 'you can make the variable mutable by declaring it with `let mut` instead of `let`'],
              ],
            })
          }

          let expectedType: ValueType = scopedVar.type

          if (propAccesses.length > 0) {
            const check = resolvePropAccessType(
              {
                leftAt: varname.at,
                leftType: scopedVar.type,
                propAccesses: propAccesses.map(({ at, matched, parsed }) => ({
                  at,
                  matched,
                  parsed: {
                    nullable: false,
                    access: parsed,
                  },
                })),
              },
              ctx
            )

            if (!check.ok) return check
            expectedType = check.data
          }

          const check: TypecheckerResult<unknown> = prefixOp
            ? resolveDoubleOpType(
                {
                  leftExprAt: varname.at,
                  leftExprType: expectedType,
                  op: buildExprDoubleOp(prefixOp, expr.at, expr.parsed.from, expr.parsed.doubleOps),
                },
                ctx
              )
            : resolveExprType(expr, {
                ...ctx,
                typeExpectation: {
                  type: expectedType,
                  from: varname.at,
                },
              })

          if (!check.ok) return check

          return success(void 0)
        },

        // Nothing to do here, already handled in first pass
        typeAlias: () => success(void 0),

        _: (): TypecheckerResult<void> => {
          throw new Error('// TODO: other statement types')
        },
      })

      if (!subResult.ok) return subResult
    }
  }

  return success(void 0)
}
