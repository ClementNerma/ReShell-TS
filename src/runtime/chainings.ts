import { FnCall, PropertyAccess, ValueChaining } from '../shared/ast'
import { isLocEq } from '../shared/loc-cmp'
import { CodeSection, Token } from '../shared/parsed'
import { getLocatedPrecomp } from '../shared/precomp'
import { matchUnion } from '../shared/utils'
import { err, ExecValue, Runner, RunnerResult, success } from './base'
import { runExpr } from './expr'
import { executePrecompFnBody, RunnableFnContent } from './fncall'
import { nativeLibraryFunctions } from './native-lib'

export const runValueChainings: Runner<{ value: ExecValue; chainings: Token<ValueChaining>[] }, ExecValue> = (
  { value, chainings },
  ctx
) => {
  if (chainings.length === 0) return success(value)

  for (const chaining of chainings) {
    const result = runValueChaining({ value, chaining }, ctx)
    if (result.ok !== true) return result

    value = result.data
  }

  return success(value)
}

const runValueChaining: Runner<{ value: ExecValue; chaining: Token<ValueChaining> }, ExecValue> = (
  { value, chaining },
  ctx
) =>
  matchUnion(chaining.parsed, 'type', {
    propertyAccess: ({ nullable, access }) => {
      if (nullable && value.type === 'null') {
        return success({ type: 'null' })
      }

      return runPropertyAccess({ value, propAccessAt: chaining.at, propAccess: access }, ctx)
    },

    method: ({ nullable, call }) => runMethod({ value, nullable, call }, ctx),
  })

export const runPropertyAccess: Runner<
  {
    value: ExecValue
    propAccessAt: CodeSection
    propAccess: PropertyAccess
    write?: Runner<ExecValue | undefined, ExecValue>
    writeAllowNonExistentMapKeys?: boolean
  },
  ExecValue
> = ({ value, propAccessAt, propAccess, write, writeAllowNonExistentMapKeys }, ctx) =>
  matchUnion(propAccess, 'type', {
    refIndex: ({ index }): RunnerResult<ExecValue> => {
      const execIndex = runExpr(index.parsed, ctx)
      if (execIndex.ok !== true) return execIndex

      if (execIndex.data.type === 'number') {
        if (value.type !== 'list') {
          return err(
            propAccessAt,
            `internal error: expected left value to be a "list" because of "number" index, found internal type "${value.type}"`
          )
        }

        if (Math.floor(execIndex.data.value) !== execIndex.data.value) {
          return err(index.at, `cannot use non-integer value as a list index (found: ${execIndex.data.value})`)
        }

        if (execIndex.data.value < 0) {
          return err(index.at, `cannot use negative number as a list index (found: ${execIndex.data.value})`)
        }

        if (execIndex.data.value >= value.items.length) {
          return err(
            index.at,
            `index out-of-bounds, list contains ${value.items.length} elements but tried to access index ${execIndex.data.value}`
          )
        }

        const item = value.items[execIndex.data.value]
        if (!write) return success(item)

        const mapped = write(value.items[execIndex.data.value], ctx)
        if (mapped.ok !== true) return mapped

        value.items[execIndex.data.value] = mapped.data

        return success(mapped.data)
      } else if (execIndex.data.type === 'string') {
        if (value.type !== 'map') {
          return err(
            propAccessAt,
            `internal error: expected left value to be a "map" because of "string" index, found internal type "${value.type}"`
          )
        }

        const entry = value.entries.get(execIndex.data.value)

        if (!write) {
          return entry !== undefined ? success(entry) : err(index.at, 'tried to access non-existent key in map')
        }

        if (entry === undefined && writeAllowNonExistentMapKeys !== true) {
          return err(index.at, 'cannot assign to non-existent key in map')
        }

        const mapped = write(entry, ctx)
        if (mapped.ok !== true) return mapped

        value.entries.set(execIndex.data.value, mapped.data)

        return success(mapped.data)
      } else {
        return err(
          index.at,
          `internal error: expected index to be a "number" or "string", found internal type "${value.type}"`
        )
      }
    },

    refStructMember: ({ member }) => {
      if (value.type !== 'struct') {
        return err(
          propAccessAt,
          `internal error: expected left value to be a "struct" because of struct member access, found internal type "${value.type}"`
        )
      }

      const accessed = value.members.get(member.parsed)

      if (accessed === undefined) {
        return err(propAccessAt, 'internal error: tried to access non-existent member in struct')
      }

      if (!write) return success(accessed)

      const mapped = write(accessed, ctx)
      if (mapped.ok !== true) return mapped

      value.members.set(member.parsed, mapped.data)

      return success(mapped.data)
    },
  })

export const runMethod: Runner<{ value: ExecValue; nullable: boolean; call: FnCall }, ExecValue> = (
  { value, nullable, call },
  ctx
) => {
  if (nullable && value.type === 'null') {
    return success({ type: 'null' })
  }

  const precomp = getLocatedPrecomp(ctx.fnOrCmdCalls, call.name.at)

  if (precomp === undefined) {
    return err(call.name.at, 'internal error: precomputed data not found for this method call')
  }

  if (precomp === null) {
    return err(call.name.at, 'internal error: precomputed data indicates this method call is a command call')
  }

  if (!precomp.methodTypeRef) {
    return err(call.name.at, 'internal error: missing method type reference in precomputed call data')
  }

  const ref = precomp.methodTypeRef
  const method = ctx.methods.find((method) => isLocEq(method.infos.forType.at.start, ref.at.start))

  let fn: RunnableFnContent

  if (method) {
    fn = { type: 'block', body: method.body }
  } else {
    const method = nativeLibraryFunctions.get(call.name.parsed)

    if (method) {
      fn = { type: 'native', exec: method }
    } else {
      return err(call.name.at, 'internal error: method not found from precomputed call data location')
    }
  }

  return executePrecompFnBody({ nameAt: call.name.at, fn, precomp, scopeMapping: null }, ctx)
}
