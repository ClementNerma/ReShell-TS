import { CmdArg } from '../shared/ast'
import { CodeSection } from '../shared/parsed'
import { matchUnion } from '../shared/utils'
import { err, ExecValue, Runner, RunnerContext, RunnerResult, success } from './base'
import { runExpr } from './expr'
import { runValue } from './value'

export const runCmdArg: Runner<CmdArg, string> = (cmdArg, ctx) =>
  matchUnion(cmdArg, 'type', {
    flag: ({ name, short, directValue }) => {
      const out: string[] = [short.parsed ? '-' : '--', name.parsed]

      if (directValue) {
        out.push('=')

        const execValue = runExpr(directValue.parsed, ctx)
        if (execValue.ok !== true) return execValue

        const stringified = stringifyExecValue(directValue.at, execValue.data, ctx)
        if (stringified.ok !== true) return stringified

        out.push(stringified.data)
      }

      return success(out.join(''))
    },
    action: ({ name }) => success(name.parsed),
    expr: ({ expr }) => {
      const execExpr = runExpr(expr.parsed, ctx)
      return execExpr.ok === true ? stringifyExecValue(expr.at, execExpr.data, ctx) : execExpr
    },
    value: ({ value }) => {
      const execValue = runValue(value, ctx)
      return execValue.ok === true ? stringifyExecValue(value.at, execValue.data, ctx) : execValue
    },
    rest: ({ varname }) => {
      for (const scope of ctx.scopes.reverse()) {
        const entity = scope.entities.get(varname.parsed)

        if (entity) {
          return stringifyExecValue(varname.at, entity, ctx)
        }
      }

      return err(varname.at, 'internal error: variable not found')
    },
  })

function stringifyExecValue(at: CodeSection, value: ExecValue, ctx: RunnerContext): RunnerResult<string> {
  switch (value.type) {
    case 'number':
      return success(value.value.toString())

    case 'string':
      return success(value.value)

    case 'path':
      return success(value.segments.join(ctx.platformPathSeparator))

    default:
      return err(
        at,
        `internal error: expected command argument to be either "number", "string" or "path", found internal type "${value.type}`
      )
  }
}
