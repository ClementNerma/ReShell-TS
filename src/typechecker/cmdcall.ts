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

    // reference: ({ varname }) => {
    //   const scopedVar = getVariableInScope(varname, ctx)
    //   if (!scopedVar.ok) return scopedVar

    //   const type = scopedVar.data.content.type

    //   return cmdArgExprTypeValidator(varname.at, type)
    // },

    value: ({ value }) => {
      const resolved = resolveValueType(value, ctx)
      return resolved.ok ? cmdArgExprTypeValidator(value.at, resolved.data) : resolved
    },
  })

function cmdArgExprTypeValidator(at: CodeSection, type: ValueType): TypecheckerResult<void> {
  if (type.nullable) {
    return err(at, 'command arguments cannot be nullable')
  }

  if (type.inner.type !== 'string' && type.inner.type !== 'path') {
    return err(at, `expected \`string\` or \`path\`, found \`${rebuildType(type, true)}\``)
  }

  return success(void 0)
}
