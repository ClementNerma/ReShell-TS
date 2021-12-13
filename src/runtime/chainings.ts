import { FnCall, PropertyAccess, ValueChaining } from '../shared/ast'
import { isLocEq } from '../shared/loc-cmp'
import { CodeSection, Token } from '../shared/parsed'
import { getLocatedPrecomp } from '../shared/precomp'
import { matchUnion } from '../shared/utils'
import { err, ExecValue, Runner, RunnerResult, ScopedMethod, success } from './base'
import { runExpr } from './expr'
import { executePrecompFnBody, RunnableFnContent } from './fncall'
import { nativeLibraryMethods } from './native-lib'

/**
 * Evaluate the result of a value associated to a list of chainings
 */
export const runValueChainings: Runner<{ value: ExecValue; chainings: Token<ValueChaining>[] }, ExecValue> = (
  { value, chainings },
  ctx
) => {
  // Optimization: nothing to do if there is no chaining
  if (chainings.length === 0) return success(value)

  // Optimization: nested pre-computed calls (see the related function for more infos.)
  const optimized = optimizeValueChainings(chainings, ctx)
  if (optimized.ok !== true) return optimized
  if (optimized.data) return success(optimized.data)

  // Otherwise, treat all chainings, one by one
  for (const chaining of chainings) {
    const result = runValueChaining({ value, chaining }, ctx)
    if (result.ok !== true) return result

    value = result.data
  }

  return success(value)
}

/**
 * This function's purpose is to optimize a list of value chainings
 * The problem we encouter is the following:
 * When we call multiple methods in the same expression, e.g `a.b().c()`
 * What happens is in the precomputed function call, the first argument (self) is set as
 * `a` for the first function, and `a.b()` for the second one, which means `b` gets called twice.
 * The number of calls then grows exponentially with the number of methods
 * To prevent this problem, only the last method in an expression should be evaluated, as its first
 * argument is an expression containing the whole expression ending just before this call.
 * So this method is here to perform this optimization, preventing this expentional increase in calls
 *
 * If there is no optimization to perform, it simply returns `null`
 * Otherwise, it performs the method call and returns its result as an execution value
 */
const optimizeValueChainings: Runner<Token<ValueChaining>[], ExecValue | null> = (chainings, ctx) => {
  // Find the last usage of a method in the chainings
  const methodUsage = [...chainings].reverse().findIndex((chaining) => chaining.parsed.type === 'method')

  // If there is none, there is no optimization to perform here
  if (methodUsage === -1) return success(null)

  // Get the method usage in the chainings list
  const index = chainings.length - 1 - methodUsage
  const method = chainings[index]
  if (method.parsed.type !== 'method') throw new Error('Method type assertion failed')

  // Run the said method
  const methodResult = runMethod(method.parsed.call, ctx)
  if (methodResult.ok !== true) return methodResult

  // Run the remaining chainings (if any)
  return runValueChainings({ value: methodResult.data, chainings: chainings.slice(index + 1) }, ctx)
}

/**
 * Run a chaining on a value
 */
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

    method: ({ nullable, call }) => {
      if (nullable && value.type === 'null') {
        return success({ type: 'null' })
      }

      return runMethod(call, ctx)
    },

    earlyReturn: () => {
      if (value.type !== 'failable') {
        return err(chaining.at, 'internal error: tried to apply early operator on non-failable value')
      }

      return value.success ? success(value.value) : { ok: null, breaking: 'return', value: value.value }
    },
  })

/**
 * Evaluate a property access on a value
 */
export const runPropertyAccess: Runner<
  {
    /** Value to access a property of */
    value: ExecValue
    /** Where the property access happens */
    propAccessAt: CodeSection
    /** The property access to evaluate */
    propAccess: PropertyAccess
    /** Should a value be written to this property? */
    write?: Runner<ExecValue | undefined, ExecValue>
    /** Should writing be allowed for non-existent map keys? */
    writeAllowNonExistentMapKeys?: boolean
  },
  ExecValue
> = ({ value, propAccessAt, propAccess, write, writeAllowNonExistentMapKeys }, ctx) =>
  matchUnion(propAccess, 'type', {
    refIndex: ({ index }): RunnerResult<ExecValue> => {
      const execIndex = runExpr(index.parsed, ctx)
      if (execIndex.ok !== true) return execIndex

      if (execIndex.data.type === 'int') {
        if (value.type !== 'list') {
          return err(
            propAccessAt,
            `internal error: expected left value to be a "list" because of "number" index, found internal type "${value.type}"`
          )
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

/**
 * Run a method call on a value
 */
export const runMethod: Runner<FnCall, ExecValue> = (call, ctx) => {
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
  let method: ScopedMethod | null = null

  // Find the declared method's content
  for (let s = ctx.scopes.length - 1; s >= 0; s--) {
    const candidate = ctx.scopes[s].methods.find((method) => isLocEq(method.infos.forType.at.start, ref.at.start))

    if (candidate) {
      method = candidate
      break
    }
  }

  let fn: RunnableFnContent

  if (method) {
    fn = { type: 'block', body: method.body }
  } else {
    // If not found, look for it in the native library
    const method = nativeLibraryMethods.get(call.name.parsed)

    if (!method) {
      return err(call.name.at, 'internal error: method not found from precomputed call data location')
    }

    fn = { type: 'native', exec: method }
  }

  // Execute the method's body
  return executePrecompFnBody({ nameAt: call.name.at, fn, precomp, scopeMapping: null }, ctx)
}
