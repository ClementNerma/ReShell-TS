import { StatementChain, ValueType } from '../shared/ast'
import { diagnostic, DiagnosticLevel } from '../shared/diagnostics'
import { CodeSection, Token } from '../shared/parsed'
import { matchUnion } from '../shared/utils'
import { err, Scope, ScopeEntity, success, Typechecker, TypecheckerContext, TypecheckerResult } from './base'
import { cmdCallTypechecker } from './cmdcall'
import { cmdDeclSubCommandTypechecker } from './cmddecl'
import { flattenStatementChains, scopeFirstPass } from './scope/first-pass'
import { getTypedEntityInScope } from './scope/search'
import { buildExprDoubleOp, resolveDoubleOpType } from './types/double-op'
import { resolveExprOrTypeAssertionType, resolveExprType } from './types/expr'
import { validateFnBody } from './types/fn'
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

  for (const stmt of flattenStatementChains(chain)) {
    if (previousStmt?.metadata.neverEnds) {
      ctx.emitDiagnostic(
        diagnostic(
          stmt.at,
          {
            message: 'previous statement always returns (or break loop), so this is dead code',
            also: [
              {
                at: previousStmt.at,
                message: 'this statement always returns or break loop',
              },
            ],
          },
          DiagnosticLevel.Warning
        )
      )
    }

    const stmtMetadata: TypecheckerResult<StatementMetadata> = matchUnion(stmt.parsed, 'type', {
      variableDecl: ({ varname, vartype, mutable, expr }): TypecheckerResult<StatementMetadata> => {
        const entity = ctx.scopes[ctx.scopes.length - 1].get(varname.parsed)

        if (entity?.type === 'fn') {
          return err(varname.at, {
            message: 'a function already exists with this name',
            also: [{ at: entity.at, message: 'original declaration occurs here' }],
          })
        }

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

        currentScope.set(varname.parsed, {
          type: 'var',
          at: varname.at,
          mutable: mutable.parsed,
          varType: expectedType ?? validation.data,
        })

        return success({ neverEnds: false })
      },

      assignment: ({ varname, propAccesses, prefixOp, listPush, expr }) => {
        if (prefixOp && listPush) {
          return err(prefixOp.at, 'cannot use an arithmetic operator when pushing to a list')
        }

        const tryScopedVar = getTypedEntityInScope(varname, 'var', ctx)
        if (!tryScopedVar.ok) return tryScopedVar

        if (!tryScopedVar.data.mutable) {
          return err(varname.at, {
            message: `cannot assign to non-mutable variable \`${varname.parsed}\``,
            complements: [['tip', 'you can make the variable mutable by declaring it with `let mut` instead of `let`']],
          })
        }

        let expectedType: ValueType = tryScopedVar.data.varType

        if (propAccesses.length > 0) {
          const check = resolvePropAccessType(
            {
              leftAt: varname.at,
              leftType: expectedType,
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

        let listPushType: ValueType | null

        if (listPush) {
          if (expectedType.type !== 'list') {
            return err(varname.at, 'cannot use the push syntax ([]) as this variable is not a list')
          }

          listPushType = expectedType.itemsType
        } else {
          listPushType = null
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
                type: listPushType ?? expectedType,
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
          for (const [varname, scopedVar] of condCheck.data.assertionScope.entries()) {
            currentScope.set(varname, scopedVar)
          }
        }

        return success({
          // a simple 'if' with no 'else' variant cannot never-end (e.g. `if <cond> { <throw> }` is not never-ending)
          neverEnds: neverEnds && els !== null && thenCheck.data.neverEnds,
        })
      },

      forLoop: ({ loopvar, loopvar2, subject, body }) => {
        const subjectType: TypecheckerResult<[ValueType, ValueType | null]> = matchUnion(subject.parsed, 'type', {
          expr: ({ expr }) => {
            const subjectType = resolveExprType(expr, ctx)
            if (!subjectType.ok) return subjectType

            if (subjectType.data.type === 'list') {
              return success([subjectType.data.itemsType, null])
            } else if (subjectType.data.type === 'map') {
              return success([{ type: 'string' }, subjectType.data.itemsType])
            } else {
              return err(subject.at, 'cannot iterate over non-list values')
            }
          },

          range: ({ from, to }) => {
            const fromType = resolveExprType(from, {
              ...ctx,
              typeExpectation: { from: null, type: { type: 'number' } },
            })
            if (!fromType.ok) return fromType

            const toType = resolveExprType(to, {
              ...ctx,
              typeExpectation: { from: null, type: { type: 'number' } },
            })
            if (!toType.ok) return toType

            return success([{ type: 'number' }, null])
          },
        })

        if (!subjectType.ok) return subjectType

        const scopeEntries: [string, ScopeEntity][] = [
          [loopvar.parsed, { type: 'var', at: loopvar.at, mutable: false, varType: subjectType.data[0] }],
        ]

        if (subjectType.data[1]) {
          if (!loopvar2) {
            return err(loopvar.at, {
              message: 'cannot iterate directly on maps',
              complements: [['tip', 'you can iterate on maps using: for key, value in <a map>']],
            })
          }

          scopeEntries.push([
            loopvar2.parsed,
            { type: 'var', at: loopvar2.at, mutable: false, varType: subjectType.data[1] },
          ])
        } else if (loopvar2) {
          return err(loopvar2.at, 'secondary loop variables can only be used on maps')
        }

        if (loopvar2?.parsed === loopvar.parsed) {
          return err(loopvar2.at, {
            message: 'cannot use the same identifier for both loop variables',
            also: [{ at: loopvar.at, message: 'original identifier is used here' }],
          })
        }

        const check = statementChainChecker(body, {
          ...ctx,
          inLoop: true,
          scopes: scopes.concat([new Map(scopeEntries)]),
        })

        if (!check.ok) return check

        if (check.data.neverEnds) {
          ctx.emitDiagnostic(diagnostic(stmt.at, 'this loop always returns or breaks', DiagnosticLevel.Warning))
        }

        return success({ neverEnds: false })
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
          scopes: condCheck.data.type === 'assertion' ? ctx.scopes.concat([condCheck.data.assertionScope]) : ctx.scopes,
        })

        if (!check.ok) return check

        if (check.data.neverEnds) {
          ctx.emitDiagnostic(diagnostic(stmt.at, 'this loop always returns or breaks', DiagnosticLevel.Warning))
        }

        return success({ neverEnds: false })
      },

      continue: () => {
        if (!ctx.inLoop) {
          return err(stmt.at, 'the "continue" instruction is only allowed inside loops')
        }

        return success({ neverEnds: true })
      },

      break: () => {
        if (!ctx.inLoop) {
          return err(stmt.at, 'the "break" instruction is only allowed inside loops')
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
            new Map([
              [catchVarname.parsed, { type: 'var', at: catchVarname.at, mutable: false, varType: wrapper.ref.content }],
            ]),
          ]),
        })
      },

      // Nothing to do here, already handled in first pass
      typeAlias: () => success({ neverEnds: false }),
      // Same here
      enumDecl: () => success({ neverEnds: false }),

      match: ({ subject, arms }) => {
        const matchOn = resolveExprType(subject, ctx)
        if (!matchOn.ok) return matchOn

        if (matchOn.data.type !== 'enum') {
          return err(
            subject.at,
            `matching can only be performed on enums, found \`${rebuildType(matchOn.data, true)}\``
          )
        }

        const toMatch = [...matchOn.data.variants]

        let neverEnds = true
        let usedFallback: CodeSection | false = false
        const usedVariants: Token<string>[] = []

        for (const { variant, matchWith } of arms) {
          const check = statementChainChecker(matchWith.parsed, ctx)
          if (!check.ok) return check

          if (variant.parsed === '_') {
            if (usedFallback) {
              return err(variant.at, {
                message: 'cannot use the fallback pattern twice',
                also: [{ at: usedFallback, message: 'fallback pattern already used here' }],
              })
            }

            usedFallback = variant.at
            continue
          }

          const relevant = toMatch.findIndex((v) => v.parsed === variant.parsed)

          if (relevant === -1) {
            return err(variant.at, {
              message: `unknown variant \`${variant.parsed}\``,
              complements: [['valid variants', toMatch.map((v) => v.parsed).join(', ')]],
            })
          }

          const firstMatch = usedVariants.find((v) => v.parsed === variant.parsed)

          if (firstMatch) {
            return err(variant.at, {
              message: 'cannot match the same variant twice',
              also: [{ at: firstMatch.at, message: 'matched here previously' }],
            })
          }

          toMatch.splice(relevant, 1)
          neverEnds &&= check.data.neverEnds
        }

        if (toMatch.length > 0 && !usedFallback) {
          return err(stmt.at, `missing arms for variants: ${toMatch.map((v) => v.parsed).join(', ')}`)
        }

        return success({ neverEnds })
      },

      fnDecl: ({ fnType, body }) => {
        const check = validateFnBody({ fnType, body }, ctx)
        return check.ok ? success({ neverEnds: false }) : check
      },

      return: ({ expr }) => {
        if (!ctx.fnExpectation) {
          return err(stmt.at, '`return` statements are only allowed inside functions')
        }

        if (!ctx.fnExpectation.returnType) {
          return expr
            ? err(expr.at, 'current function does not have a return type so the `return` statement should be empty')
            : success({ neverEnds: true })
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
          return err(stmt.at, '`throw` statements are only allowed inside functions')
        }

        if (!ctx.fnExpectation.failureType) {
          return expr ? err(stmt.at, 'current function does not have a failure type') : success({ neverEnds: true })
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

        return resolved.ok ? success({ neverEnds: true }) : resolved
      },

      panic: ({ message }) => {
        const check = resolveExprType(message, {
          ...ctx,
          typeExpectation: { from: null, type: { type: 'string' } },
        })

        if (!check.ok) return check

        return success({ neverEnds: true })
      },

      cmdCall: ({ content }) => {
        const cmdCallCheck = cmdCallTypechecker(content, ctx)
        return cmdCallCheck.ok ? success({ neverEnds: false }) : cmdCallCheck
      },

      cmdDecl: ({ name, body }) => {
        const orig = ctx.commandDeclarations.get(name.parsed)

        if (orig) {
          return err(name.at, {
            message: 'cannot declare a command twice',
            also: [{ at: orig.at, message: 'command was originally declared here' }],
          })
        }

        if (!ctx.checkIfCommandExists(name.parsed)) {
          return err(name.at, 'this command was not found in PATH')
        }

        const check = cmdDeclSubCommandTypechecker(body, ctx)
        if (!check.ok) return check

        ctx.commandDeclarations.set(name.parsed, { at: name.at, content: body })

        return success({ neverEnds: false })
      },

      // Nothing to do here, already handled in first pass
      fileInclusion: () => success({ neverEnds: false }),
    })

    if (!stmtMetadata.ok) return stmtMetadata

    previousStmt = { at: stmt.at, metadata: stmtMetadata.data }
  }

  const metadata: StatementMetadata = previousStmt?.metadata ?? { neverEnds: false }

  return success({ ...metadata, topLevelScope: currentScope })
}
