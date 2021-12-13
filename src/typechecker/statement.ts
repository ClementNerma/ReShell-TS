import { ExprElement, Statement, ValueType } from '../shared/ast'
import { diagnostic, DiagnosticLevel } from '../shared/diagnostics'
import { CodeSection, Token } from '../shared/parsed'
import { matchStrWithValues, matchUnion } from '../shared/utils'
import { err, success, Typechecker, TypecheckerResult } from './base'
import { blockChecker, StatementChainMetadata } from './block'
import { cmdCallTypechecker } from './cmdcall'
import { cmdDeclSubCommandTypechecker } from './cmddecl'
import { enumMatchingTypechecker } from './matching'
import { getTypedEntityInScope } from './scope/search'
import { developTypeAliasesIn } from './types/aliases'
import { resolveValueChainings } from './types/chaining'
import { buildExprDoubleOp, resolveDoubleOpType } from './types/double-op'
import { resolveCondOrTypeAssertionType, resolveExprType } from './types/expr'
import { resolveFnCallType, validateFnBody } from './types/fn'
import { rebuildType } from './types/rebuilder'
import { typeValidator } from './types/validator'

export type StatementMetadata = Omit<StatementChainMetadata, 'topLevelScope'>

export const statementChecker: Typechecker<Token<Statement>, StatementMetadata> = (stmt, ctx) => {
  return matchUnion(stmt.parsed, 'type', {
    variableDecl: ({ varname, vartype, mutable, expr }): TypecheckerResult<StatementMetadata> => {
      const entity = ctx.scopes[ctx.scopes.length - 1].entities.get(varname.parsed)

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
              from: vartype?.at ?? null,
            }
          : null,
      })
      if (!validation.ok) return validation

      ctx.scopes[ctx.scopes.length - 1].entities.set(varname.parsed, {
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

      const leftAt: CodeSection = {
        start: varname.at.start,
        next: propAccesses.length > 0 ? propAccesses[propAccesses.length - 1].at.next : varname.at.next,
      }

      if (propAccesses.length > 0) {
        const check = resolveValueChainings(
          {
            left: {
              at: varname.at,
              matched: varname.matched,
              parsed: {
                type: 'value',
                content: {
                  at: varname.at,
                  matched: varname.matched,
                  parsed: {
                    type: 'reference',
                    varname,
                  },
                },
              },
            },
            leftType: expectedType,
            chainings: propAccesses.map((access) => ({
              at: access.at,
              matched: access.matched,
              parsed: { type: 'propertyAccess', access: access.parsed, nullable: false },
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
          return err(listPush.at, 'cannot use the push syntax ([]) on a non-list value')
        }

        listPushType = expectedType.itemsType
      } else {
        listPushType = null
      }

      const synth: Token<ExprElement> = {
        at: expr.at,
        matched: expr.matched,
        parsed: {
          content: {
            at: expr.at,
            matched: expr.matched,
            parsed: {
              type: 'synth',
              inner: expr,
            },
          },
          chainings: [],
        },
      }

      const check: TypecheckerResult<ValueType> = prefixOp
        ? resolveDoubleOpType(
            { leftExprAt: leftAt, leftExprType: expectedType, op: buildExprDoubleOp(prefixOp, expr.at, synth, []) },
            ctx
          )
        : resolveExprType(expr, { ...ctx, typeExpectation: { type: listPushType ?? expectedType, from: leftAt } })

      if (!check.ok) return check

      return success({ neverEnds: false })
    },

    ifBlock: ({ cond, then: body, elif, els }) => {
      const condCheck = resolveCondOrTypeAssertionType(cond, {
        ...ctx,
        typeExpectation: { type: { type: 'bool' }, from: null },
      })

      if (!condCheck.ok) return condCheck

      const thenCheck = blockChecker(
        body,
        condCheck.data.type === 'assertion'
          ? { ...ctx, scopes: ctx.scopes.concat([condCheck.data.normalAssertionScope]) }
          : ctx
      )

      if (!thenCheck.ok) return thenCheck

      const blocksMetadata: StatementChainMetadata[] = []

      for (const { cond, body } of elif) {
        const condCheck = resolveCondOrTypeAssertionType(cond, {
          ...ctx,
          typeExpectation: { type: { type: 'bool' }, from: null },
        })

        if (!condCheck.ok) return condCheck

        const elifCheck = blockChecker(body, {
          ...ctx,
          scopes:
            condCheck.data.type === 'assertion' ? ctx.scopes.concat([condCheck.data.normalAssertionScope]) : ctx.scopes,
        })

        if (!elifCheck.ok) return elifCheck

        blocksMetadata.push(elifCheck.data)
      }

      if (els) {
        const elseCheck = blockChecker(
          els,
          condCheck.data.type === 'assertion' && condCheck.data.inverted
            ? { ...ctx, scopes: ctx.scopes.concat(condCheck.data.normalAssertionScope) }
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
        const assertionScope = condCheck.data.inverted
          ? condCheck.data.normalAssertionScope
          : condCheck.data.oppositeAssertionScope

        for (const [varname, scopedVar] of assertionScope.entities) {
          ctx.scopes[ctx.scopes.length - 1].entities.set(varname, scopedVar)
        }
      }

      return success({
        // a simple 'if' with no 'else' variant cannot never-end (e.g. `if <cond> { <throw> }` is not never-ending)
        neverEnds: neverEnds && els !== null && thenCheck.data.neverEnds,
      })
    },

    forLoop: ({ loopVar, subject, body }) => {
      const subjectType = resolveExprType(subject, ctx)
      if (!subjectType.ok) return subjectType

      if (subjectType.data.type === 'map') {
        return err(subject.at, {
          message: 'cannot iterate directly on maps',
          complements: [['tip', 'you can iterate on maps using: for key, value in <a map>']],
        })
      } else if (subjectType.data.type !== 'list') {
        return err(
          subject.at,
          `cannot iterate over non-list/map values (found \`${rebuildType(subjectType.data, { noDepth: true })}\`)`
        )
      }

      const check = blockChecker(body, {
        ...ctx,
        inLoop: true,
        scopes: ctx.scopes.concat([
          {
            generics: new Map(),
            methods: [],
            entities: new Map([
              [loopVar.parsed, { type: 'var', at: loopVar.at, mutable: false, varType: subjectType.data.itemsType }],
            ]),
          },
        ]),
      })

      if (!check.ok) return check

      if (check.data.neverEnds) {
        ctx.emitDiagnostic(diagnostic(stmt.at, 'this loop always returns or breaks', DiagnosticLevel.Warning))
      }

      return success({ neverEnds: check.data.neverEnds })
    },

    forLoopDuo: ({ keyVar, valueVar, subject, body }) => {
      const subjectType = resolveExprType(subject, ctx)
      if (!subjectType.ok) return subjectType

      if (subjectType.data.type !== 'list' && subjectType.data.type !== 'map') {
        return err(
          subject.at,
          `expected a \`list\` or \`map\` to iterate on, found a \`${rebuildType(subjectType.data, {
            noDepth: true,
          })}\``
        )
      }

      const iterVarType: ValueType = matchStrWithValues(subjectType.data.type, {
        list: { type: 'int' },
        map: { type: 'string' },
      })

      const check = blockChecker(body, {
        ...ctx,
        inLoop: true,
        scopes: ctx.scopes.concat([
          {
            generics: new Map(),
            methods: [],
            entities: new Map([
              [keyVar.parsed, { type: 'var', at: keyVar.at, mutable: false, varType: iterVarType }],
              [valueVar.parsed, { type: 'var', at: valueVar.at, mutable: false, varType: subjectType.data.itemsType }],
            ]),
          },
        ]),
      })

      if (!check.ok) return check

      if (check.data.neverEnds) {
        ctx.emitDiagnostic(diagnostic(stmt.at, 'this loop always returns or breaks', DiagnosticLevel.Warning))
      }

      return success({ neverEnds: check.data.neverEnds })
    },

    whileLoop: ({ cond, body }) => {
      const condCheck = resolveCondOrTypeAssertionType(cond, {
        ...ctx,
        typeExpectation: { type: { type: 'bool' }, from: null },
      })

      if (!condCheck.ok) return condCheck

      const check = blockChecker(body, {
        ...ctx,
        inLoop: true,
        scopes:
          condCheck.data.type === 'assertion' ? ctx.scopes.concat([condCheck.data.normalAssertionScope]) : ctx.scopes,
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

    // Nothing to do here, already handled in first pass
    typeAlias: () => success({ neverEnds: false }),
    // Same here
    enumDecl: () => success({ neverEnds: false }),

    match: ({ subject, arms }) => {
      let neverEnds = true

      const check = enumMatchingTypechecker(
        subject,
        arms,
        ctx,
        (matchWith) => blockChecker(matchWith.parsed, ctx),
        (block) => {
          neverEnds &&= block.neverEnds
        }
      )

      return check.ok ? success({ neverEnds }) : check
    },

    fnDecl: ({ fnType, body }) => {
      const check = validateFnBody({ fnType, body }, ctx)
      return check.ok ? success({ neverEnds: false }) : check
    },

    methodDecl: ({ fnType, body }) => {
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

    panic: ({ message }) => {
      const check = resolveExprType(message, {
        ...ctx,
        typeExpectation: { from: null, type: { type: 'string' } },
      })

      if (!check.ok) return check

      return success({ neverEnds: true })
    },

    fnCall: ({ content }) => {
      const returnType = developTypeAliasesIn(resolveFnCallType(content, ctx), ctx)
      if (!returnType.ok) return returnType

      if (returnType.data.type === 'failable') {
        ctx.emitDiagnostic(
          diagnostic(
            content.name.at,
            'this function call returns a `failable` value which is not handled',
            DiagnosticLevel.Warning
          )
        )
      }

      return success({ neverEnds: false })
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
}
