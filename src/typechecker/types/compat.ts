import { ValueType } from '../../shared/ast'
import { CodeSection } from '../../shared/parsed'
import { err, success, Typechecker, TypecheckerContext, TypecheckerResult } from '../base'
import { getTypeAliasInScope } from '../scope/search'
import { rebuildType } from './rebuilder'

export const isTypeCompatible: Typechecker<
  {
    candidate: ValueType
    at: CodeSection
    typeExpectation: Exclude<TypecheckerContext['typeExpectation'], null>
    _path?: string[]
    _originalCandidate?: ValueType
    _originalReferent?: ValueType
  },
  void
> = ({ candidate, at, typeExpectation, _path, _originalCandidate, _originalReferent }, ctx) => {
  const expectationErr = (message?: string, atOverride?: CodeSection) => {
    const pathStr = path.length > 0 ? path.join(' > ') + ' > ' : ''

    const expectedNoDepth = rebuildType(typeExpectation.type, true)
    const expected = rebuildType(originalReferent)

    const foundNoDepth = rebuildType(candidate, true)
    const found = rebuildType(originalCandidate)

    const messageWithFallback =
      message ??
      `expected ${
        ctx.typeExpectationNature ? ctx.typeExpectationNature + ' ' : ''
      }\`${expectedNoDepth}\`, found \`${foundNoDepth}\``

    return err(atOverride ?? at, {
      message: pathStr + messageWithFallback,
      complements:
        expectedNoDepth !== expected || foundNoDepth !== found
          ? [
              ['expected', expected],
              ['found   ', found],
            ]
          : [],
      also: typeExpectation.from
        ? [
            {
              at: typeExpectation.from,
              message: 'type expectation originates here',
            },
          ]
        : [],
    })
  }
  // errIncompatibleValueType({
  //   message,
  //   path,
  //   typeExpectation: {
  //     type: referent,
  //     from,
  //   },
  //   foundType: candidate,
  //   valueAt: atOverride ?? at,
  //   ctx,
  // })

  const subCheck = (addPath: string | null, candidate: ValueType, referent: ValueType, atOverride?: CodeSection) =>
    isTypeCompatible(
      {
        candidate,
        at: atOverride ?? at,
        typeExpectation: { from, type: referent },
        _path: addPath === null ? path : path.concat([addPath]),
        _originalCandidate: originalCandidate,
        _originalReferent: originalReferent,
      },
      ctx
    )

  const { from } = typeExpectation

  const originalCandidate = _originalCandidate ?? candidate
  const originalReferent = _originalReferent ?? typeExpectation.type

  let referent = typeExpectation.type

  const path = _path ?? []

  if (referent.type === 'unknown') {
    return success(void 0)
  }

  if (candidate.type === 'unknown') {
    return expectationErr()
  }

  while (candidate.type === 'aliasRef') {
    const alias = getTypeAliasInScope(candidate.typeAliasName, ctx)

    if (!alias.ok) {
      return expectationErr(
        'internal error: candidate type alias reference not found in scope while checking for type compatibility'
      )
    }

    candidate = alias.data.content
  }

  while (referent.type === 'aliasRef') {
    const alias = getTypeAliasInScope(referent.typeAliasName, ctx)

    if (!alias.ok) {
      return expectationErr(
        'internal error: referent type alias reference not found in scope while checking for type compatibility'
      )
    }

    referent = alias.data.content
  }

  if (candidate.type === 'nullable') {
    return referent.type !== 'nullable'
      ? expectationErr('value should not be nullable')
      : subCheck('nullable type', candidate.inner, referent.inner)
  } else if (referent.type === 'nullable') {
    return subCheck('nullable type', candidate, referent.inner)
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

        const compat = subCheck(null, cArg.type, rArg.type, rArgAt)
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
          {
            candidate: c.fnType.returnType.parsed,
            at: c.fnType.returnType.at,
            typeExpectation: { type: r.fnType.returnType.parsed, from: r.fnType.returnType.at },
          },
          ctx
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
          {
            candidate: c.fnType.failureType.parsed,
            at: c.fnType.failureType.at,
            typeExpectation: { type: r.fnType.failureType.parsed, from: r.fnType.failureType.at },
          },
          ctx
        )

        if (!retTypeCompat.ok) return retTypeCompat
      } else if (!c.fnType.failureType && r.fnType.failureType) {
        return expectationErr(`function was expected to have a failure type`)
      }

      return success(void 0)
    },

    aliasRef: () => expectationErr('internal error: unreachable "aliasRef" type comparison'),
    unknown: () => expectationErr('internal error: unreachable "unknown" type comparison'),
    nullable: () => expectationErr('internal error: unreachable "nullable" type comparison'),

    // Internal types
    void: () => expectationErr('internal error: trying to compare candidate with internal type "void"'),
  }

  return comparators[candidate.type](candidate as any, referent as any)
}
