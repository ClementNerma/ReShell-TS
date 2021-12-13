import { Block, Expr, Value } from '../shared/ast'
import { CodeSection, Token } from '../shared/parsed'
import { getLocatedPrecomp } from '../shared/precomp'
import { matchUnion } from '../shared/utils'
import { ensureCoverage, err, ExecValue, Runner, RunnerContext, RunnerResult, Scope, success } from './base'
import { runBlock } from './block'
import { runCmdArg } from './cmdarg'
import { runExpr } from './expr'

export const runValue: Runner<Token<Value>, ExecValue> = (value, ctx) =>
  matchUnion(value.parsed, 'type', {
    null: () => success({ type: 'null' }),
    bool: ({ value }) => success({ type: 'bool', value: value.parsed }),
    number: ({ value }) => success({ type: 'number', value: value.parsed }),
    string: ({ value }) => success({ type: 'string', value: value.parsed }),
    path: ({ segments }) => success({ type: 'path', segments: segments.parsed.map((segment) => segment.parsed) }),

    computedString: ({ segments }) => {
      const out: string[] = []

      for (const segment of segments) {
        switch (segment.parsed.type) {
          case 'literal':
            out.push(segment.parsed.content.parsed)
            break

          case 'expr': {
            const execExpr = runExpr(segment.parsed.expr.parsed, ctx)
            if (execExpr.ok !== true) return execExpr

            if (execExpr.data.type === 'string') {
              out.push(execExpr.data.value)
            } else if (execExpr.data.type === 'number') {
              out.push(execExpr.data.value.toString())
            } else {
              return err(
                segment.at,
                `internal error: expected segment to be either "string" or "number", found internal type "${execExpr.data.type}"`
              )
            }
            break
          }

          default:
            return ensureCoverage(segment.parsed)
        }
      }

      return success({ type: 'string', value: out.join('') })
    },

    computedPath: ({ segments }) => {
      let currentSegment: string[] = []
      const out: string[] = []

      for (const segment of segments) {
        switch (segment.parsed.type) {
          case 'literal':
            currentSegment.push(segment.parsed.content.parsed)
            break

          case 'expr': {
            const execExpr = runExpr(segment.parsed.expr.parsed, ctx)
            if (execExpr.ok !== true) return execExpr

            if (execExpr.data.type === 'string') {
              currentSegment.push(execExpr.data.value)
            } else if (execExpr.data.type === 'path') {
              if (currentSegment.length > 0) {
                out.push(currentSegment.join(''))
                currentSegment = []
              }

              out.push(...execExpr.data.segments)
            } else {
              return err(
                segment.at,
                `internal error: expected segment to be either "string" or "path", found internal type "${execExpr.data.type}"`
              )
            }

            break
          }

          case 'separator':
            if (currentSegment.length > 0) {
              out.push(currentSegment.join(''))
              currentSegment = []
            }
            break

          default:
            return ensureCoverage(segment.parsed)
        }
      }

      if (currentSegment.length > 0) {
        out.push(currentSegment.join(''))
      }

      return success({ type: 'path', segments: out })
    },

    list: ({ items }) => {
      const out: ExecValue[] = []

      for (const item of items) {
        const execItem = runExpr(item.parsed, ctx)
        if (execItem.ok !== true) return execItem

        out.push(execItem.data)
      }

      return success({ type: 'list', items: out })
    },

    map: ({ entries }) => {
      const out = new Map<string, ExecValue>()

      for (const { key, value } of entries) {
        const execValue = runExpr(value.parsed, ctx)
        if (execValue.ok !== true) return execValue

        out.set(key.parsed, execValue.data)
      }

      return success({ type: 'map', entries: out })
    },

    struct: ({ members }) => {
      const out = new Map<string, ExecValue>()

      for (const { name, value } of members) {
        const execValue = runExpr(value.parsed, ctx)
        if (execValue.ok !== true) return execValue

        out.set(name.parsed, execValue.data)
      }

      return success({ type: 'struct', members: out })
    },

    enumVariant: ({ variant }) => success({ type: 'enum', variant: variant.parsed }),

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

      return runExpr(relevantArm.matchWith.parsed, ctx)
    },

    callback: ({ args, restArg, body }) => {
      const fnType = getLocatedPrecomp(ctx.callbackTypes, value.at)

      if (fnType === undefined) {
        return err(body.at, "internal error: failed to get this function's type from context")
      }

      return success({
        type: 'callback',
        def: { args: args.map((arg) => arg.parsed.name.parsed), restArg: restArg?.parsed ?? null },
        body: body.parsed,
        fnType,
      })
    },

    fnCall: ({ name }) => {
      const fnCall = getLocatedPrecomp(ctx.fnCalls, name.at)

      if (fnCall === undefined) {
        return err(name.at, 'internal error: failed to get precomputed function call data')
      }

      let fn: { type: 'block'; body: Token<Block> } | { type: 'expr'; body: Token<Expr> } | null = null

      for (const scope of ctx.scopes.reverse()) {
        const entity = scope.entities.get(name.parsed)

        if (entity) {
          if (entity.type === 'fn') {
            fn = { type: 'block', body: entity.body }
          } else if (entity.type === 'callback') {
            fn = entity.body
          } else {
            return err(name.at, `internal error: expected to find a function, found internal type "${entity.type}"`)
          }
        }
      }

      if (fn === null) {
        return err(name.at, 'internal error: entity not found in scope')
      }

      const fnScope: Scope['entities'] = new Map()

      for (const [argName, content] of fnCall.args) {
        const execValue: RunnerResult<ExecValue> = matchUnion(content, 'type', {
          null: () => success({ type: 'null' }),
          expr: ({ expr }) => runExpr(expr.parsed, ctx),
          value: ({ value }) => runValue(value, ctx),
        })

        if (execValue.ok !== true) return execValue
        fnScope.set(argName, execValue.data)
      }

      if (fnCall.restArg) {
        const out: string[] = []

        for (const cmdArg of fnCall.restArg.content) {
          const stringified = runCmdArg(cmdArg.parsed, ctx)
          if (stringified.ok !== true) return stringified

          out.push(stringified.data)
        }

        fnScope.set(fnCall.restArg.name, { type: 'rest', content: out })
      }

      const fnCtx: RunnerContext = {
        ...ctx,
        scopes: ctx.scopes.concat([{ generics: fnCall.generics, entities: fnScope }]),
      }

      const result: RunnerResult<unknown> = matchUnion(fn, 'type', {
        block: ({ body }) => runBlock(body.parsed, fnCtx),
        expr: ({ body }) => runExpr(body.parsed, fnCtx),
      })

      if (result.ok === false) return result

      if (!fnCall.hasReturnType) {
        if (result.ok === null && result.breaking === 'return' && result.value !== null) {
          return err(name.at, 'internal error: function unexpectedly returned a value')
        }

        return success({ type: 'null' })
      }

      if (result.ok !== null || result.breaking !== 'return') {
        return err(name.at, 'internal error: function did not return')
      }

      if (result.value === null) {
        return err(name.at, 'internal error: function did not return a value')
      }

      return success(result.value)
    },

    inlineCmdCallSequence: (/*{ start, sequence, capture }*/) => {
      throw new Error('TODO: inline command call sequences')
      // TODO: generics resolution
    },

    reference: ({ varname }) => {
      for (const scope of ctx.scopes.reverse()) {
        const value = scope.entities.get(varname.parsed)

        if (value) {
          return success(value)
        }
      }

      return err(varname.at, 'internal error: reference not found in scope')
    },
  })

export function expectValueType<T extends ExecValue['type']>(
  at: CodeSection,
  value: ExecValue,
  type: T
): RunnerResult<Extract<ExecValue, { type: T }>> {
  return value.type === type
    ? success(value as Extract<ExecValue, { type: T }>)
    : err(at, `internal error: type mismatch (expected internal type "${type}", found "${value.type}")`)
}
