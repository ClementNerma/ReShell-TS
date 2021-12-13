import { StatementChain, ValueType } from '../shared/ast'
import { CodeSection, Token } from '../shared/parsed'
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

export type StatementChainMetadata = {
  neverEnds: boolean
  topLevelScope: Scope
}

type StatementMetadata = Omit<StatementChainMetadata, 'topLevelScope'>

export const statementChainChecker: Typechecker<Token<StatementChain>[], StatementChainMetadata> = (chain, ctx) => {
  const firstPass = scopeFirstPass(chain, ctx)
  if (!firstPass.ok) return firstPass

  // 1. Find all declared functions and type alias
  // 2. Discover scope sequentially using the items above

  const currentScope = firstPass.data
  const scopes = ctx.scopes.concat(currentScope)

  ctx = { ...ctx, scopes }

  let previousStmt: { at: CodeSection; metadata: StatementMetadata } | null = null

  for (const stmt of chain) {
    if (stmt.parsed.type === 'empty') continue

    const stmtAt = getStatementChainSection(stmt)

    if (previousStmt?.metadata.neverEnds) {
      return err(stmtAt, {
        message: 'previous statement always returns (or break loop), so this is dead code',
        also: [
          {
            at: previousStmt.at,
            message: 'this statement always returns or break loop',
          },
        ],
      })
    }

    for (const sub of [stmt.parsed.start].concat(stmt.parsed.sequence.map((c) => c.parsed.chainedStatement))) {
      const stmtMetadata: TypecheckerResult<StatementMetadata> = matchUnion(sub.parsed, 'type', {
        variableDecl: ({ varname, vartype, mutable, expr }): TypecheckerResult<StatementMetadata> => {
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

          currentScope.variables.set(
            varname.parsed,
            located(varname.at, { mutable: mutable.parsed, type: expectedType ?? validation.data })
          )

          return success({ neverEnds: false })
        },

        assignment: ({ varname, propAccesses, prefixOp, expr }) => {
          const tryScopedVar = getVariableInScope(varname, ctx)
          if (!tryScopedVar.ok) return tryScopedVar

          const { content: scopedVar } = tryScopedVar.data

          if (!scopedVar.mutable) {
            return err(varname.at, {
              message: `cannot assign to non-mutable variable \`${varname.parsed}\``,
              complements: [
                ['tip', 'you can make the variable mutable by declaring it with `let mut` instead of `let`'],
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

          return success({ neverEnds: false })
        },

        ifBlock: ({ cond, then: body, elif, els }) => {
          const condCheck = resolveExprOrTypeAssertionType(cond, {
            ...ctx,
            typeExpectation: { type: { type: 'bool' }, from: null },
          })

          if (!condCheck.ok) return condCheck

          const thenCheck = statementChainChecker(
            body,
            condCheck.data.type === 'assertion' && !condCheck.data.inverted
              ? { ...ctx, scopes: ctx.scopes.concat([condCheck.data.assertionScope]) }
              : ctx
          )

          if (!thenCheck.ok) return thenCheck

          let blocksMetadata: StatementChainMetadata[] = []

          for (const { cond, body } of elif) {
            const condCheck = resolveExprOrTypeAssertionType(cond, {
              ...ctx,
              typeExpectation: { type: { type: 'bool' }, from: null },
            })

            if (!condCheck.ok) return condCheck

            const elifCheck = statementChainChecker(body, {
              ...ctx,
              scopes:
                condCheck.data.type === 'assertion' ? ctx.scopes.concat([condCheck.data.assertionScope]) : ctx.scopes,
            })

            if (!elifCheck.ok) return elifCheck

            blocksMetadata.push(elifCheck.data)
          }

          if (els) {
            const elseCheck = statementChainChecker(
              els,
              condCheck.data.type === 'assertion' && condCheck.data.inverted
                ? {
                    ...ctx,
                    scopes: ctx.scopes.concat(condCheck.data.assertionScope),
                  }
                : ctx
            )

            if (!elseCheck.ok) return elseCheck

            blocksMetadata.push(elseCheck.data)
          }

          const neverEnds = blocksMetadata.every((metadata) => metadata.neverEnds)

          if (
            condCheck.data.type === 'assertion' &&
            ((condCheck.data.inverted && thenCheck.data.neverEnds) || (!condCheck.data.inverted && neverEnds))
          ) {
            for (const [varname, vartype] of condCheck.data.assertionScope.variables.entries()) {
              currentScope.variables.set(varname, vartype)
            }
          }

          return success({
            // a simple 'if' with no 'else' variant cannot never-end (e.g. `if <cond> { <throw> }` is not never-ending)
            neverEnds: neverEnds && els !== null && thenCheck.data.neverEnds,
          })
        },

        forLoop: ({ loopvar, subject, body }) => {
          const subjectType = resolveExprType(subject, ctx)
          if (!subjectType.ok) return subjectType

          if (subjectType.data.type !== 'list') {
            return err(subject.at, 'cannot iterate over non-list values')
          }

          const check = statementChainChecker(body, {
            ...ctx,
            inLoop: true,
            scopes: scopes.concat([
              {
                functions: new Map(),
                typeAliases: new Map(),
                variables: new Map([
                  [loopvar.parsed, located(loopvar.at, { mutable: false, type: subjectType.data.itemsType })],
                ]),
              },
            ]),
          })

          if (!check.ok) return check

          return check.data.neverEnds
            ? err(stmtAt, 'this loop always returns or breaks')
            : success({ neverEnds: false })
        },

        whileLoop: ({ cond, body }) => {
          const condCheck = resolveExprOrTypeAssertionType(cond, {
            ...ctx,
            typeExpectation: { type: { type: 'bool' }, from: null },
          })

          if (!condCheck.ok) return condCheck

          const check = statementChainChecker(body, {
            ...ctx,
            inLoop: true,
            scopes:
              condCheck.data.type === 'assertion' ? ctx.scopes.concat([condCheck.data.assertionScope]) : ctx.scopes,
          })

          if (!check.ok) return check

          return check.data.neverEnds
            ? err(stmtAt, 'this loop always returns or breaks')
            : success({ neverEnds: false })
        },

        break: () => {
          if (!ctx.inLoop) {
            return err(stmtAt, 'the "break" instruction is only allowed inside loops')
          }

          return success({ neverEnds: true })
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
                  'tip',
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
        typeAlias: () => success({ neverEnds: false }),

        fnDecl: ({ fnType, body }) => {
          const check = statementChainChecker(body, {
            ...ctx,
            scopes: scopes.concat([fnScopeCreator(fnType)]),
            fnExpectation: {
              failureType: fnType.failureType ? { type: fnType.failureType.parsed, from: fnType.failureType.at } : null,
              returnType: fnType.returnType ? { type: fnType.returnType.parsed, from: fnType.returnType.at } : null,
            },
          })

          if (!check.ok) return check

          if (fnType.returnType !== null && !check.data.neverEnds) {
            return err(fnType.returnType.at, 'not all code paths return a value')
          }

          return success({ neverEnds: false })
        },

        return: ({ expr }) => {
          if (!ctx.fnExpectation) {
            return err(stmtAt, '`return` statements are only allowed inside functions')
          }

          if (!ctx.fnExpectation.returnType) {
            return expr
              ? err(expr.at, 'current function does not have a return type so the `return` statement should be empty')
              : success({ neverEnds: true })
          }

          if (!expr) {
            return err(stmtAt, {
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
          return resolved.ok ? success({ neverEnds: true }) : resolved
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

              return resolved.ok ? success({ neverEnds: true }) : resolved
            } else {
              const resolved = resolveExprType(expr, { ...ctx, typeExpectation: null })
              if (!resolved.ok) return resolved

              ctx.expectedFailureWriter.ref = { at: expr.at, content: resolved.data }
              return success({ neverEnds: true })
            }
          }

          if (!ctx.fnExpectation) {
            return err(stmtAt, '`throw` statements are only allowed inside functions')
          }

          if (!ctx.fnExpectation.failureType) {
            return expr ? err(stmtAt, 'current function does not have a failure type') : success({ neverEnds: true })
          }

          if (!expr) {
            return err(stmtAt, {
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

          return resolved.ok ? success({ neverEnds: true }) : resolved
        },

        cmdCall: (call) => {
          const cmdCallCheck = cmdCallTypechecker(call, ctx)
          return cmdCallCheck.ok ? success({ neverEnds: false }) : cmdCallCheck
        },

        // Nothing to do here, already handled in first pass
        fileInclusion: () => success({ neverEnds: false }),
      })

      if (!stmtMetadata.ok) return stmtMetadata

      previousStmt = { at: stmtAt, metadata: stmtMetadata.data }
    }
  }

  const metadata: StatementMetadata = previousStmt?.metadata ?? { neverEnds: false }

  return success({ ...metadata, topLevelScope: currentScope })
}

function getStatementChainSection(stmt: Token<StatementChain>): CodeSection {
  return {
    start: stmt.parsed.type === 'empty' ? stmt.at.start : stmt.parsed.start.at.start,
    next: stmt.at.next,
  }
}
