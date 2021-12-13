import { Value } from '../shared/ast'
import { isLocEq } from '../shared/loc-cmp'
import { CodeSection, Token } from '../shared/parsed'
import { getLocatedPrecomp } from '../shared/precomp'
import { matchUnion } from '../shared/utils'
import { ensureCoverage, err, ExecValue, Runner, RunnerResult, success } from './base'
import { runInlineCmdCall } from './cmdcall'
import { runExpr } from './expr'
import { executeFnCallByName } from './fncall'
import { nativeLibraryVariables } from './native-lib'
import { getEntityInScope } from './scope'

export const runValue: Runner<Token<Value>, ExecValue> = (value, ctx) =>
  matchUnion(value.parsed, 'type', {
    null: () => success({ type: 'null' }),
    bool: ({ value }) => success({ type: 'bool', value: value.parsed }),
    int: ({ value }) => success({ type: 'int', value: value.parsed }),
    float: ({ value }) => success({ type: 'float', value: value.parsed }),
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
            } else if (execExpr.data.type === 'int' || execExpr.data.type === 'float') {
              out.push(execExpr.data.value.toString())
            } else if (execExpr.data.type === 'path') {
              out.push(execExpr.data.segments.join(ctx.platformPathSeparator))
            } else {
              return err(
                segment.at,
                `internal error: expected segment to be either "string", "int", "float" or "path", found internal type "${execExpr.data.type}"`
              )
            }
            break
          }

          case 'inlineCmdCall': {
            const execCmd = runInlineCmdCall(segment.parsed.content, ctx)
            if (execCmd.ok !== true) return execCmd

            const outString = expectValueType(segment.at, execCmd.data, 'string')
            if (outString.ok !== true) return outString

            out.push(outString.data.value)
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
            if (currentSegment.length > 0 || out.length === 0) {
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

    callback: ({ body }) => {
      const fnType = getLocatedPrecomp(ctx.callbackTypes, value.at)

      if (fnType === undefined) {
        return err(body.at, "internal error: failed to get this function's type from context")
      }

      const argsMapping = ctx.closuresArgsMapping.find(({ at }) => isLocEq(value.at.start, at.start))

      if (!argsMapping) {
        return err(
          value.at,
          'internal error: arguments scope mapping not found for the callback stored in this variable'
        )
      }

      return success({
        type: 'callback',
        body: body.parsed,
        argsMapping: argsMapping.data,
        fnType,
      })
    },

    fnCall: ({ content: { name } }) => executeFnCallByName(name, ctx),

    inlineCmdCall: ({ content }) => runInlineCmdCall(content, ctx),

    reference: ({ varname }) => {
      const value = getEntityInScope(varname, ctx)
      if (value.ok === true) return success(value.data)

      const nativeVar = nativeLibraryVariables.get(varname.parsed)
      return nativeVar ? success(nativeVar(ctx)) : err(varname.at, 'internal error: reference not found in scope')
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

export function expectValueTypeIn<T extends ExecValue['type']>(
  at: CodeSection,
  value: ExecValue,
  types: T[]
): RunnerResult<Extract<ExecValue, { type: T }>> {
  return (types as ExecValue['type'][]).includes(value.type)
    ? success(value as Extract<ExecValue, { type: T }>)
    : err(
        at,
        `internal error: type mismatch (expected one of internal types ${types
          .map((type) => `"${type}"`)
          .join(' / ')}, found "${value.type}")`
      )
}
