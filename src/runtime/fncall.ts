import { Block, Expr } from '../shared/ast'
import { Token } from '../shared/parsed'
import { FnCallPrecomp } from '../shared/precomp'
import { matchUnion } from '../shared/utils'
import { err, ExecValue, Runner, RunnerContext, RunnerResult, Scope, success } from './base'
import { runBlock } from './block'
import { runCmdArg } from './cmdarg'
import { runExpr } from './expr'
import { NativeFn, nativeLibraryFunctions } from './native-lib'
import { runValue } from './value'

export const executeFnCall: Runner<{ name: Token<string>; precomp: FnCallPrecomp }, ExecValue> = (
  { name, precomp: fnCall },
  ctx
) => {
  let fn:
    | { type: 'block'; body: Token<Block> }
    | { type: 'expr'; body: Token<Expr> }
    | { type: 'native'; exec: NativeFn }
    | null = null

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
    const nativeFn = nativeLibraryFunctions.get(name.parsed)

    if (nativeFn) {
      fn = { type: 'native', exec: nativeFn }
    } else {
      return err(name.at, 'internal error: entity not found in scope')
    }
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
    native: ({ exec }) => exec(fnCtx, name.at, ...fnScope.values()),
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
}
