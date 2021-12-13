import { ValueType } from '../../shared/ast'
import { CodeSection } from '../../shared/parsed'
import { err, success, Typechecker, TypecheckerResult } from '../base'
import { getTypeAliasInScope } from '../scope/search'
import { errIncompatibleValueType } from './value'

export const isTypeCompatible: Typechecker<{ candidate: ValueType; at: CodeSection; _path?: string[] }, void> = (
  { candidate, at, _path },
  ctx
) => {
  const expectationErr = (message?: string, atOverride?: CodeSection) =>
    errIncompatibleValueType({
      message: path.length > 0 ? path.join(' > ') + ' > ' + message : message,
      typeExpectation: {
        type: referent,
        from,
      },
      foundType: candidate,
      valueAt: atOverride ?? at,
      ctx,
    })

  const subCheck = (addPath: string, candidate: ValueType, referent: ValueType) =>
    isTypeCompatible(
      { candidate, at, _path: path.concat([addPath]) },
      { ...ctx, typeExpectation: { from, type: referent } }
    )

  if (!ctx.typeExpectation) {
    return err(at, 'Internal error: type expectation is not defined in context when checking for type compatibility')
  }

  const { typeExpectation } = ctx
  const { from } = typeExpectation

  let referent = typeExpectation.type

  const path = _path ?? []

  if (candidate.type === 'nullable' && referent.type !== 'nullable') {
    return expectationErr('Value should not be nullable')
  }

  if (referent.type === 'unknown') {
    return success(void 0)
  }

  if (candidate.type === 'unknown') {
    return expectationErr()
  }

  if (candidate.type === 'aliasRef') {
    const alias = getTypeAliasInScope(candidate.typeAliasName, ctx)

    if (!alias.ok) {
      return expectationErr(
        'Internal error: candidate type alias reference not found in scope while checking for type compatibility'
      )
    }

    candidate = alias.data.content
  }

  if (referent.type === 'aliasRef') {
    const alias = getTypeAliasInScope(referent.typeAliasName, ctx)

    if (!alias.ok) {
      return expectationErr(
        'Internal error: referent type alias reference not found in scope while checking for type compatibility'
      )
    }

    referent = alias.data.content
  }

  if (candidate.type !== referent.type) {
    return expectationErr()
  }

  const comparators: {
    [type in ValueType['type']]: (
      candidate: Extract<ValueType, { type: type }>,
      referent: Extract<ValueType, { type: type }>
    ) => TypecheckerResult<void> // | boolean
  } = {
    bool: () => success(void 0),
    number: () => success(void 0),
    string: () => success(void 0),
    path: () => success(void 0),
    list: (c, r) => subCheck('list', c.itemsType, r.itemsType),
    map: (c, r) => subCheck('map', c.itemsType, r.itemsType),
    struct: (c, r) => {
      const candidateMembers = new Map(c.members.map(({ name, type }) => [name, type]))
      const referentMembers = new Map(r.members.map(({ name, type }) => [name, type]))

      for (const [name, type] of referentMembers.entries()) {
        const candidateMember = candidateMembers.get(name)

        if (!candidateMember) {
          return expectationErr(`missing member \`${name}\``)
        }

        const comparison = subCheck('.' + name, candidateMember, type)
        if (!comparison.ok) return comparison
      }

      for (const name of candidateMembers.keys()) {
        if (!referentMembers.has(name)) {
          return expectationErr(`member \`${name}\` is provided but not expected`)
        }
      }

      return success(void 0)
    },

    fn: (c, r) => {
      for (let i = 0; i < c.fnType.args.length; i++) {
        const { at, parsed: cArg } = c.fnType.args[i]

        if (r.fnType.args.length <= i) {
          return expectationErr(`argument \`${cArg.name.parsed}\` is provided but not expected in parent type`, at)
        }

        const { at: rArgAt, parsed: rArg } = r.fnType.args[i]

        if (cArg.flag) {
          if (!rArg.flag) {
            return expectationErr(
              `argument \`${cArg.name.parsed}\` is provided here as a flag but not in the parent type`,
              at
            )
          }

          if (cArg.name.parsed !== rArg.name.parsed) {
            return expectationErr(
              `flag argument \`${cArg.name.parsed}\` does not have the same type as in the parent type (\`${rArg.name.parsed}\`)`
            )
          }
        } else if (rArg.flag) {
          return expectationErr(
            `argument \`${cArg.name.parsed}\` is provided here as positional but the parent type provides it as a flag`,
            at
          )
        }

        if (cArg.optional && !rArg.optional) {
          return expectationErr(`argument \`${cArg.name.parsed}\` is marked as optional but not in the parent type`)
        }

        if (!cArg.optional && rArg.optional) {
          return expectationErr(`argument \`${cArg.name.parsed}\` is not marked as optional unlike in the parent type`)
        }

        const compat = isTypeCompatible(
          { candidate: cArg.type, at },
          { ...ctx, typeExpectation: { type: rArg.type, from: rArgAt } }
        )

        if (!compat.ok) return compat
      }

      if (r.fnType.args.length > c.fnType.args.length) {
        return expectationErr(`argument \`${r.fnType.args[c.fnType.args.length].parsed.name.parsed}\` is missing`)
      }

      if (c.fnType.returnType) {
        if (!r.fnType.returnType) {
          return expectationErr(`function was not expected to have a return type`, c.fnType.returnType.at)
        }

        const retTypeCompat = isTypeCompatible(
          { candidate: c.fnType.returnType.parsed, at: c.fnType.returnType.at },
          {
            ...ctx,
            typeExpectation: { type: r.fnType.returnType.parsed, from: r.fnType.returnType.at },
          }
        )

        if (!retTypeCompat.ok) return retTypeCompat
      } else if (!c.fnType.returnType && r.fnType.returnType) {
        return expectationErr(`function was expected to have a return type`)
      }

      if (c.fnType.failureType) {
        if (!r.fnType.failureType) {
          return expectationErr(`function was not expected to have a failure type`, c.fnType.failureType.at)
        }

        const retTypeCompat = isTypeCompatible(
          { candidate: c.fnType.failureType.parsed, at: c.fnType.failureType.at },
          { ...ctx, typeExpectation: { type: r.fnType.failureType.parsed, from: r.fnType.failureType.at } }
        )

        if (!retTypeCompat.ok) return retTypeCompat
      } else if (!c.fnType.failureType && r.fnType.failureType) {
        return expectationErr(`function was expected to have a failure type`)
      }

      return success(void 0)
    },

    aliasRef: (c, r) => {
      throw new Error('Internal error: trying to compare an alias ref')
    },

    unknown: () => {
      throw new Error('Internal error: unreachable "unknown" type comparison')
    },

    nullable: (c, r) =>
      isTypeCompatible(
        { at, candidate: c.inner },
        {
          ...ctx,
          typeExpectation: {
            type: r.inner,
            from: typeExpectation.from,
          },
        }
      ),

    // Internal types
    void: () => expectationErr('Internal error: trying to compare candidate with internal type "void"'),
  }

  return comparators[candidate.type](candidate as any, referent as any)
}
