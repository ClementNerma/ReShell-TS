import { Block, Expr } from '../shared/ast'
import { Token } from '../shared/parsed'
import { FnCallPrecomp, getLocatedPrecomp } from '../shared/precomp'
import { matchUnion } from '../shared/utils'
import { err, ExecValue, Runner, RunnerContext, RunnerResult, Scope, success } from './base'
import { runBlock } from './block'
import { runCmdArg } from './cmdarg'
import { runExpr } from './expr'
import { NativeFn, nativeLibraryFunctions } from './native-lib'
import { runValue } from './value'

export const executeFnCallByName: Runner<Token<string>, ExecValue> = (name, ctx) => {
  const precomp = getLocatedPrecomp(ctx.fnCalls, name.at)

  if (precomp === undefined) {
    return err(name.at, 'internal error: failed to get precomputed function call data')
  }

  if (precomp === null) {
    return err(name.at, 'internal error: precomputed function call data shows a command call')
  }

  return executePrecompFnCall({ name, precomp }, ctx)
}

export const executePrecompFnCall: Runner<{ name: Token<string>; precomp: FnCallPrecomp }, ExecValue> = (
  { name, precomp },
  ctx
) => {
  let fn:
    | { type: 'block'; body: Token<Block> }
    | { type: 'expr'; body: Token<Expr> }
    | { type: 'native'; exec: NativeFn }
    | null = null

  let scopeMapping: Map<string, string> | null = null

  for (let s = ctx.scopes.length - 1; s >= 0; s--) {
    const entity = ctx.scopes[s].entities.get(name.parsed)

    if (entity) {
      if (entity.type === 'fn') {
        fn = { type: 'block', body: entity.body }
      } else if (entity.type === 'callback') {
        fn = entity.body
        scopeMapping = entity.argsMapping
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

  for (const [argName, content] of precomp.args) {
    const execValue: RunnerResult<ExecValue> = matchUnion(content, 'type', {
      null: () => success({ type: 'null' }),
      false: () => success({ type: 'bool', value: false }),
      true: () => success({ type: 'bool', value: true }),
      expr: ({ expr }) => runExpr(expr.parsed, ctx),
      value: ({ value }) => runValue(value, ctx),
      fnCall: ({ nameForPrecomp }) => executeFnCallByName(nameForPrecomp, ctx),
    })

    if (execValue.ok !== true) return execValue

    if (scopeMapping) {
      const mapping = scopeMapping.get(argName)

      if (mapping === undefined) {
        return err(name.at, `internal error: missing callback argument mapping for "${argName}"`)
      }

      fnScope.set(mapping, execValue.data)
    } else {
      fnScope.set(argName, execValue.data)
    }
  }

  if (precomp.restArg) {
    const out: string[] = []

    for (const cmdArg of precomp.restArg.content) {
      const stringified = runCmdArg(cmdArg.parsed, ctx)
      if (stringified.ok !== true) return stringified

      out.push(stringified.data)
    }

    fnScope.set(precomp.restArg.name, { type: 'rest', content: out })
  }

  const fnCtx: RunnerContext = {
    ...ctx,
    scopes: ctx.scopes.concat([{ generics: precomp.generics, entities: fnScope }]),
  }

  const result: RunnerResult<unknown> = matchUnion(fn, 'type', {
    block: ({ body }) => runBlock(body.parsed, fnCtx),
    expr: ({ body }) => {
      const result = runExpr(body.parsed, fnCtx)
      return result.ok === true ? { ok: null, breaking: 'return', value: result.data } : result
    },
    native: ({ exec }) => {
      const result = exec(
        { at: name.at, ctx: fnCtx, pipeTo: ctx.pipeTo ?? { stdout: process.stdout, stderr: process.stderr } },
        fnScope
      )

      return result.ok === true ? { ok: null, breaking: 'return', value: result.data } : result
    },
  })

  if (result.ok === false) return result

  if (!precomp.hasReturnType) {
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
