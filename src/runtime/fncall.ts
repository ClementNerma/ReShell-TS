import { Block, Expr } from '../shared/ast'
import { CodeSection, Token } from '../shared/parsed'
import { getLocatedPrecomp, PrecompFnCall } from '../shared/precomp'
import { matchUnion } from '../shared/utils'
import { err, ExecValue, Runner, RunnerContext, RunnerResult, Scope, success } from './base'
import { runBlock } from './block'
import { runCmdArg } from './cmdarg'
import { runExpr } from './expr'
import { NativeFn, nativeLibraryFunctions } from './native-lib'
import { runValue } from './value'

export const executeFnCallByName: Runner<Token<string>, ExecValue> = (name, ctx) => {
  const precomp = getLocatedPrecomp(ctx.fnOrCmdCalls, name.at)

  if (precomp === undefined) {
    return err(name.at, 'internal error: failed to get precomputed function call data')
  }

  if (precomp === null) {
    return err(name.at, 'internal error: precomputed function call data shows a command call')
  }

  return runPrecompFnCall({ name, precomp }, ctx)
}

export type RunnableFnContent =
  | { type: 'block'; body: Token<Block> }
  | { type: 'expr'; body: Token<Expr> }
  | { type: 'native'; exec: NativeFn }

export const runPrecompFnCall: Runner<{ name: Token<string>; precomp: PrecompFnCall }, ExecValue> = (
  { name, precomp },
  ctx
) => {
  let fn: RunnableFnContent | null = null
  let scopeMapping: Map<string, string | null> | null = null

  for (let s = ctx.scopes.length - 1; s >= 0; s--) {
    const entity = ctx.scopes[s].entities.get(name.parsed)

    if (entity) {
      if (entity.type === 'fn') {
        fn = entity.body
        scopeMapping = entity.argsMapping
      } else {
        return err(name.at, `internal error: expected to find a function, found internal type "${entity.type}"`)
      }

      break
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

  return executePrecompFnBody({ nameAt: name.at, precomp, fn, scopeMapping }, ctx)
}

export const executePrecompFnBody: Runner<
  {
    nameAt: CodeSection
    precomp: PrecompFnCall
    fn: RunnableFnContent
    scopeMapping: Map<string, string | null> | null
  },
  ExecValue
> = ({ nameAt, precomp, fn, scopeMapping }, ctx) => {
  const fnScope: Scope['entities'] = new Map()

  let outerFirstArg = true

  for (const [argName, content] of precomp.args) {
    const innerFirstArg = outerFirstArg
    outerFirstArg = false

    const execValue: RunnerResult<ExecValue> = matchUnion(content, 'type', {
      null: () => success({ type: 'null' }),
      false: () => success({ type: 'bool', value: false }),
      true: () => success({ type: 'bool', value: true }),
      expr: ({ expr }) => runExpr(expr.parsed, ctx),
      value: ({ value }) => runValue(value, ctx),
      fnCall: ({ nameForPrecomp }) => executeFnCallByName(nameForPrecomp, ctx),
      synth: ({ value }) => success(value),
    })

    if (execValue.ok !== true) return execValue

    if (innerFirstArg && execValue.data.type === 'null' && precomp.propagateFirstArgNullability) {
      return success({ type: 'null' })
    }

    if (scopeMapping) {
      const mapping = scopeMapping.get(argName)

      if (mapping === undefined) {
        return err(nameAt, `internal error: missing callback argument mapping for "${argName}"`)
      }

      if (mapping !== null) {
        fnScope.set(mapping, execValue.data)
      }
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
    scopes: ctx.scopes.concat([{ generics: precomp.generics, methods: [], entities: fnScope }]),
  }

  const result: RunnerResult<unknown> = matchUnion(fn, 'type', {
    block: ({ body }) => runBlock(body.parsed, fnCtx),
    expr: ({ body }) => {
      const result = runExpr(body.parsed, fnCtx)
      return result.ok === true ? { ok: null, breaking: 'return', value: result.data } : result
    },
    native: ({ exec }) => {
      const result = exec(
        { at: nameAt, ctx: fnCtx, pipeTo: ctx.pipeTo ?? { stdout: process.stdout, stderr: process.stderr } },
        fnScope
      )

      return result.ok === true ? { ok: null, breaking: 'return', value: result.data } : result
    },
  })

  if (result.ok === false) return result

  if (!precomp.hasReturnType) {
    if (result.ok === null && result.breaking === 'return' && result.value !== null) {
      return err(nameAt, 'internal error: function unexpectedly returned a value')
    }

    return success({ type: 'null' })
  }

  if (result.ok !== null || result.breaking !== 'return') {
    return err(nameAt, 'internal error: function did not return')
  }

  if (result.value === null) {
    return err(nameAt, 'internal error: function did not return a value')
  }

  return success(result.value)
}
