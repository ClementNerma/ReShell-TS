import { Statement } from '../shared/ast'
import { CodeSection, Token } from '../shared/parsed'
import { matchUnion } from '../shared/utils'
import { err, ExecValue, Runner, RunnerResult, Scope, success } from './base'
import { runBlock } from './block'
import { runCmdCall } from './cmdcall'
import { runCondOrTypeAssertion, runDoubleOp, runExpr, runNonNullablePropertyAccess } from './expr'
import { executeFnCallByName } from './fncall'
import { expectValueType } from './value'

export const runStatement: Runner<Token<Statement>> = (stmt, ctx) =>
  matchUnion(stmt.parsed, 'type', {
    variableDecl: ({ varname, expr }) => {
      const scope = ctx.scopes[ctx.scopes.length - 1]
      const evaluated = runExpr(expr.parsed, ctx)
      if (evaluated.ok !== true) return evaluated

      scope.entities.set(varname.parsed, evaluated.data)
      return success(void 0)
    },

    assignment: ({ varname, propAccesses, prefixOp, listPush, expr }) => {
      let found: { scope: Scope; target: ExecValue } | null = null

      for (let s = ctx.scopes.length - 1; s >= 0; s--) {
        const entityValue = ctx.scopes[s].entities.get(varname.parsed)

        if (entityValue) {
          found = { scope: ctx.scopes[s], target: entityValue }
          break
        }
      }

      if (found === null) {
        return err(varname.at, 'internal error: variable not found in scope')
      }

      const computeValue = (leftAt: CodeSection, left: ExecValue | undefined): RunnerResult<ExecValue> => {
        const execExpr = runExpr(expr.parsed, ctx)
        if (execExpr.ok !== true) return execExpr
        if (prefixOp === null) return success(execExpr.data)

        if (left === undefined) {
          return err(leftAt, 'internal error: left value is undefined when applying prefix op during assignment')
        }

        return runDoubleOp(
          {
            leftAt,
            left,
            op: prefixOp,
            rightAt: expr.at,
            right: execExpr.data,
          },
          ctx
        )
      }

      let targetAt = varname.at
      let target = found.target

      if (propAccesses.length > 0) {
        const treatAtOnce = listPush ? propAccesses : propAccesses.slice(0, propAccesses.length - 1)

        for (const { at, parsed: propAccess } of treatAtOnce) {
          const resolved = runNonNullablePropertyAccess({ propAccessAt: at, propAccess, value: target }, ctx)
          if (resolved.ok !== true) return resolved
          target = resolved.data
          targetAt = { start: targetAt.start, next: at.next }
        }

        if (listPush === null) {
          const last = propAccesses[propAccesses.length - 1]

          const written = runNonNullablePropertyAccess(
            {
              propAccessAt: last.at,
              propAccess: last.parsed,
              value: target,
              write: (value) => computeValue(targetAt, value),
              writeAllowNonExistentMapKeys: prefixOp === null,
            },
            ctx
          )

          return written.ok !== true ? written : success(void 0)
        }
      }

      if (listPush) {
        if (target.type !== 'list') {
          return err(
            listPush.at,
            `internal error: expected left value to be a "list", found internal type "${target.type}"`
          )
        }

        const newItem = computeValue(targetAt, target)
        if (newItem.ok !== true) return newItem

        target.items.push(newItem.data)
        return success(void 0)
      }

      const newValue = computeValue(targetAt, target)
      if (newValue.ok !== true) return newValue

      found.scope.entities.set(varname.parsed, newValue.data)
      return success(void 0)
    },

    ifBlock: ({ cond, then, elif, els }) => {
      const result = runCondOrTypeAssertion(cond.parsed, ctx)
      if (result.ok !== true) return result

      const check = expectValueType(cond.at, result.data.result, 'bool')
      if (check.ok !== true) return check
      if (check.data.value) {
        return runBlock(
          then,
          result.data.type === 'assertion'
            ? { ...ctx, scopes: ctx.scopes.concat([result.data.normalAssertionScope]) }
            : ctx
        )
      }

      for (const { cond, body } of elif) {
        const result = runCondOrTypeAssertion(cond.parsed, ctx)
        if (result.ok !== true) return result

        const check = expectValueType(cond.at, result.data.result, 'bool')
        if (check.ok !== true) return check
        if (check.data.value)
          return runBlock(
            body,
            result.data.type === 'assertion'
              ? { ...ctx, scopes: ctx.scopes.concat([result.data.normalAssertionScope]) }
              : ctx
          )
      }

      return els
        ? runBlock(
            els,
            result.data.type === 'assertion'
              ? { ...ctx, scopes: ctx.scopes.concat([result.data.oppositeAssertionScope]) }
              : ctx
          )
        : success(void 0)
    },

    forLoop: ({ loopVar, subject, body }) => {
      const iterateOn: RunnerResult<ExecValue[]> = matchUnion(subject.parsed, 'type', {
        range: ({ from, to }) => {
          const resultFrom = runExpr(from.parsed, ctx)
          if (resultFrom.ok !== true) return resultFrom

          const fromValue = expectValueType(from.at, resultFrom.data, 'number')
          if (fromValue.ok !== true) return fromValue

          const resultTo = runExpr(to.parsed, ctx)
          if (resultTo.ok !== true) return resultTo

          const toValue = expectValueType(from.at, resultTo.data, 'number')
          if (toValue.ok !== true) return toValue

          const fromInt = Math.floor(fromValue.data.value)
          const toInt = Math.floor(toValue.data.value)

          return success(
            fromInt > toInt
              ? []
              : new Array(toInt - fromInt).fill(0).map((_, i) => ({ type: 'number', value: fromInt + i }))
          )
        },

        expr: ({ expr }) => {
          const result = runExpr(expr.parsed, ctx)
          if (result.ok !== true) return result

          const list = expectValueType(expr.at, result.data, 'list')
          if (list.ok !== true) return list

          return success(list.data.items.slice())
        },
      })

      if (iterateOn.ok !== true) return iterateOn

      const scope: Scope = { generics: [], entities: new Map() }
      ctx = { ...ctx, scopes: ctx.scopes.concat(scope) }

      for (const value of iterateOn.data) {
        scope.entities.set(loopVar.parsed, value)

        const result = runBlock(body, ctx)
        if (result.ok === null && result.breaking === 'continue') continue
        if (result.ok === null && result.breaking === 'break') break
        if (result.ok !== true) return result
      }

      return success(void 0)
    },

    forLoopDuo: ({ keyVar, valueVar, subject, body }) => {
      const evalSubject = runExpr(subject.parsed, ctx)
      if (evalSubject.ok !== true) return evalSubject

      const map = expectValueType(subject.at, evalSubject.data, 'map')
      if (map.ok !== true) return map

      const iterateOn = [...map.data.entries.entries()]

      const scope: Scope = { generics: [], entities: new Map() }
      ctx = { ...ctx, scopes: ctx.scopes.concat(scope) }

      for (const [key, value] of iterateOn) {
        scope.entities.set(keyVar.parsed, { type: 'string', value: key })
        scope.entities.set(valueVar.parsed, value)

        const result = runBlock(body, ctx)
        if (result.ok === null && result.breaking === 'continue') continue
        if (result.ok === null && result.breaking === 'break') break
        if (result.ok !== true) return result
      }

      return success(void 0)
    },

    whileLoop: ({ cond, body }) => {
      for (;;) {
        const result = runCondOrTypeAssertion(cond.parsed, ctx)
        if (result.ok !== true) return result

        const evalCond = expectValueType(cond.at, result.data.result, 'bool')
        if (evalCond.ok !== true) return evalCond
        if (!evalCond.data.value) break

        const exec = runBlock(
          body,
          result.data.type === 'assertion'
            ? { ...ctx, scopes: ctx.scopes.concat([result.data.normalAssertionScope]) }
            : ctx
        )

        if (exec.ok === null && exec.breaking === 'continue') continue
        if (exec.ok === null && exec.breaking === 'break') break
        if (exec.ok !== true) return exec
      }

      return success(void 0)
    },

    continue: () => ({ ok: null, breaking: 'continue' }),

    break: () => ({ ok: null, breaking: 'break' }),

    typeAlias: () => success(void 0),

    enumDecl: () => success(void 0),

    match: ({ subject, arms }) => {
      const result = runExpr(subject.parsed, ctx)
      if (result.ok !== true) return result

      const evalSubject = expectValueType(subject.at, result.data, 'enum')
      if (evalSubject.ok !== true) return evalSubject

      const relevantArm =
        arms.parsed.find((arm) => arm.variant.parsed === evalSubject.data.variant) ??
        arms.parsed.find((arm) => arm.variant.parsed === '_')

      if (!relevantArm) {
        return err(
          arms.at,
          `internal error: no match arm nor fallback found for current variant "${evalSubject.data.variant}"`
        )
      }

      return runBlock(relevantArm.matchWith.parsed, ctx)
    },

    fnDecl: ({ name, body }) => {
      const scope = ctx.scopes[ctx.scopes.length - 1]
      scope.entities.set(name.parsed, { type: 'fn', body })
      return success(void 0)
    },

    return: ({ expr }) => {
      if (!expr) return { ok: null, breaking: 'return' as const, value: null }

      const evalRetExpr = runExpr(expr.parsed, ctx)
      if (evalRetExpr.ok !== true) return evalRetExpr

      return { ok: null, breaking: 'return' as const, value: evalRetExpr.data }
    },

    panic: ({ message }) => {
      const expr = runExpr(message.parsed, ctx)
      if (expr.ok !== true) return expr

      const messageStr = expectValueType(message.at, expr.data, 'string')
      if (messageStr.ok !== true) return messageStr

      return err(message.at, `Panicked: ${messageStr.data.value}`)
    },

    fnCall: ({ content: { name } }) => {
      const result = executeFnCallByName(name, ctx)
      return result.ok === true ? success(void 0) : result
    },

    cmdCall: ({ content }) => runCmdCall(content, ctx),

    cmdDecl: () => success(void 0),

    fileInclusion: () => err(stmt.at, 'internal error: file inclusion was not flattened before running statement'),
  })
