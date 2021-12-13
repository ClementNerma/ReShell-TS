import { StatementChain, Token, ValueType } from '../shared/parsed'
import { matchUnion } from '../shared/utils'
import { err, located, Scope, success, Typechecker, TypecheckerContext, TypecheckerResult } from './base'
import { cmdCallTypechecker } from './cmdcall'
import { scopeFirstPass } from './scope/first-pass'
import { getVariableInScope } from './scope/search'
import { buildExprDoubleOp, resolveDoubleOpType } from './types/double-op'
import { resolveExprOrTypeAssertionType, resolveExprType } from './types/expr'
import { fnScopeCreator } from './types/fn'
import { resolvePropAccessType } from './types/propaccess'
import { rebuildType } from './types/rebuilder'
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

        ifBlock: ({ cond, then: body, elif, els }) => {
          const condCheck = resolveExprOrTypeAssertionType(cond, {
            ...ctx,
            typeExpectation: { type: { nullable: false, inner: { type: 'bool' } }, from: null },
          })

          if (!condCheck.ok) return condCheck

          const thenCheck = statementChainChecker(
            body,
            condCheck.data.type === 'assertion'
              ? { ...ctx, scopes: ctx.scopes.concat([condCheck.data.assertionScope]) }
              : ctx
          )

          if (!thenCheck.ok) return thenCheck

          for (const { cond, body } of elif) {
            const condCheck = resolveExprOrTypeAssertionType(cond, {
              ...ctx,
              typeExpectation: { type: { nullable: false, inner: { type: 'bool' } }, from: null },
            })

            if (!condCheck.ok) return condCheck

            const elifCheck = statementChainChecker(body, {
              ...ctx,
              scopes:
                condCheck.data.type === 'assertion' ? ctx.scopes.concat([condCheck.data.assertionScope]) : ctx.scopes,
            })

            if (!elifCheck.ok) return elifCheck
          }

          if (els) {
            const elseCheck = statementChainChecker(els, ctx)

            if (!elseCheck.ok) return elseCheck
          }

          return success(void 0)
        },

        tryBlock: ({ body, catchVarname, catchBody }) => {
          const wrapper: TypecheckerContext['expectedFailureWriter'] = { ref: null }

          const bodyChecker = statementChainChecker(body, { ...ctx, expectedFailureWriter: wrapper })
          if (!bodyChecker.ok) return bodyChecker

          if (wrapper.ref === null) {
            return err(catchVarname.at, {
              message: "failed to determine the catch clause's variable type",
              complements: [
                [
                  'Tip',
                  "you must use a failable instruction like a function call or a throw instruction inside the try's body",
                ],
              ],
            })
          }

          return statementChainChecker(catchBody, {
            ...ctx,
            scopes: ctx.scopes.concat([
              {
                typeAliases: new Map(),
                functions: new Map(),
                variables: new Map([
                  [
                    catchVarname.parsed,
                    { at: catchVarname.at, content: { mutable: false, type: wrapper.ref.content } },
                  ],
                ]),
              },
            ]),
          })
        },

        // Nothing to do here, already handled in first pass
        typeAlias: () => success(void 0),

        fnDecl: ({ fnType, body }) => {
          return statementChainChecker(body, {
            ...ctx,
            scopes: scopes.concat([fnScopeCreator(fnType)]),
            fnExpectation: {
              failureType: fnType.failureType ? { type: fnType.failureType.parsed, from: fnType.failureType.at } : null,
              returnType: fnType.returnType ? { type: fnType.returnType.parsed, from: fnType.returnType.at } : null,
            },
          })
        },

        return: ({ expr }) => {
          if (!ctx.fnExpectation) {
            return err(stmt.at, '`return` statements are only allowed inside functions')
          }

          if (!ctx.fnExpectation.returnType) {
            return expr
              ? err(expr.at, 'current function does not have a return type so the `return` statement should be empty')
              : success(void 0)
          }

          if (!expr) {
            return err(stmt.at, {
              message: `missing return expression (expected \`${rebuildType(ctx.fnExpectation.returnType.type)}\`)`,
              also: [
                {
                  at: ctx.fnExpectation.returnType.from,
                  message: 'return type expectation originates here',
                },
              ],
            })
          }

          const resolved = resolveExprType(expr, { ...ctx, typeExpectation: ctx.fnExpectation.returnType })
          return resolved.ok ? success(void 0) : resolved
        },

        throw: ({ expr }) => {
          if (ctx.expectedFailureWriter) {
            if (ctx.expectedFailureWriter.ref !== null) {
              const resolved = resolveExprType(expr, {
                ...ctx,
                typeExpectation: {
                  type: ctx.expectedFailureWriter.ref.content,
                  from: ctx.expectedFailureWriter.ref.at,
                },
                typeExpectationNature: 'failure type',
              })

              return resolved.ok ? success(void 0) : resolved
            } else {
              const resolved = resolveExprType(expr, { ...ctx, typeExpectation: null })
              if (!resolved.ok) return resolved

              ctx.expectedFailureWriter.ref = { at: expr.at, content: resolved.data }
              return success(void 0)
            }
          }

          if (!ctx.fnExpectation) {
            return err(stmt.at, '`throw` statements are only allowed inside functions')
          }

          if (!ctx.fnExpectation.failureType) {
            return expr ? err(stmt.at, 'current function does not have a failure type') : success(void 0)
          }

          if (!expr) {
            return err(stmt.at, {
              message: `missing failure value (expected \`${rebuildType(ctx.fnExpectation.failureType.type)}\`)`,
              also: [
                {
                  at: ctx.fnExpectation.failureType.from,
                  message: 'failure type expectation originates here',
                },
              ],
            })
          }

          const resolved = resolveExprType(expr, {
            ...ctx,
            typeExpectation: ctx.fnExpectation.failureType,
            typeExpectationNature: 'failure type',
          })

          return resolved.ok ? success(void 0) : resolved
        },

        cmdCall: (call) => cmdCallTypechecker(call, ctx),

        _: (): TypecheckerResult<void> => {
          throw new Error('// TODO: other statement types')
        },
      })

      if (!subResult.ok) return subResult
    }
  }

  return success(void 0)
}
