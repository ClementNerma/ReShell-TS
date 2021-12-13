import { CmdArg, CmdCall, ValueType } from '../shared/ast'
import { CodeSection, Token } from '../shared/parsed'
import { matchUnion } from '../shared/utils'
import { err, success, Typechecker, TypecheckerResult } from './base'
import { getFunctionInScope } from './scope/search'
import { resolveExprType } from './types/expr'
import { validateFnCallArgs } from './types/fn'
import { rebuildType } from './types/rebuilder'
import { resolveValueType } from './types/value'

export const cmdCallTypechecker: Typechecker<CmdCall, void> = ({ name, args, redir }, ctx) => {
  const fn = getFunctionInScope(name, ctx)

  if (fn.ok) {
    return validateFnCallArgs({ at: name.at, args, fnType: fn.data.content }, ctx)
  } else {
    if (!ctx.checkIfCommandExists(name.parsed)) {
      return err(name.at, 'this command was not found in PATH')
    }

    for (const arg of args) {
      const check = cmdArgTypechecker(arg, ctx)
      if (!check.ok) return check
    }

    return success(void 0)
  }
}

export const cmdArgTypechecker: Typechecker<Token<CmdArg>, void> = (arg, ctx) =>
  matchUnion(arg.parsed, 'type', {
    escape: () => success(void 0),

    expr: ({ expr }) => {
      const resolved = resolveExprType(expr, ctx)
      return resolved.ok ? cmdArgExprTypeValidator(expr.at, resolved.data) : resolved
    },

    flag: ({ directValue }) => {
      if (directValue === null) return success(void 0)
      const resolved = resolveExprType(directValue, ctx)
      return resolved.ok ? cmdArgExprTypeValidator(directValue.at, resolved.data) : resolved
    },

    value: ({ value }) => {
      const resolved = resolveValueType(value, ctx)
      return resolved.ok ? cmdArgExprTypeValidator(value.at, resolved.data) : resolved
    },

    rest: ({ varname }) =>
      ctx.restArgs.includes(varname.parsed)
        ? success(void 0)
        : err(varname.at, `rest argument \`${varname.parsed}\` was not found`),
  })

function cmdArgExprTypeValidator(at: CodeSection, type: ValueType): TypecheckerResult<void> {
  if (type.type !== 'string' && type.type !== 'number' && type.type !== 'path') {
    return err(
      at,
      `command arguments can only be of type \`string\`, \`number\` or \`path\`, found \`${rebuildType(type, true)}\``
    )
  }

  return success(void 0)
}
