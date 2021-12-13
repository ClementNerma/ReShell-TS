import { ValueType } from '../../shared/ast'
import { DiagnosticExtract } from '../../shared/diagnostics'
import { isLocEq } from '../../shared/loc-cmp'
import { CodeSection } from '../../shared/parsed'
import { err, GenericResolutionScope, success, Typechecker, TypecheckerContext, TypecheckerResult } from '../base'
import { getResolvedGenericInSingleScope } from '../scope/search'
import { developTypeAliases } from './aliases'
import { getFnDeclArgType } from './fn'
import { isResolvedGenericDifferent, resolveGenerics } from './generics-resolver'
import { rebuildType } from './rebuilder'

export const isTypeCompatible: Typechecker<
  {
    candidate: ValueType
    at: CodeSection
    typeExpectation: Exclude<TypecheckerContext['typeExpectation'], null>
    fillKnownGenerics?: GenericResolutionScope
    _path?: string[]
    _originalCandidate?: ValueType
    _originalReferent?: ValueType
  },
  void
> = ({ candidate, at, typeExpectation, fillKnownGenerics, _path, _originalCandidate, _originalReferent }, ctx) => {
  const expectationErr = (message?: string, atOverride?: CodeSection, also?: DiagnosticExtract[]) => {
    const pathStr = path.length > 0 ? path.join(' > ') + ' > ' : ''

    const expectedNoDepth = rebuildType(typeExpectation.type, true)
    const expected = rebuildType(originalReferent)

    const foundNoDepth = rebuildType(candidate, true)
    const found = rebuildType(originalCandidate)

    const messageWithFallback =
      message ??
      `expected ${
        ctx.typeExpectationNature !== null ? ctx.typeExpectationNature + ' ' : ''
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
      also: (also ?? []).concat(
        typeExpectation.from
          ? [
              {
                at: typeExpectation.from,
                message: 'type expectation originates here',
              },
            ]
          : []
      ),
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

  const subCheck = (options: {
    addPath?: string
    candidate: ValueType
    candidateAt?: CodeSection
    referent: ValueType
    referentAt?: CodeSection | null
  }) =>
    isTypeCompatible(
      {
        candidate: options.candidate,
        at: options.candidateAt ?? at,
        typeExpectation: {
          from: options.referentAt !== undefined ? options.referentAt : from,
          type: options.referent,
        },
        fillKnownGenerics,
        _path: options.addPath === undefined ? path : path.concat([options.addPath]),
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

  const developedCandidate = developTypeAliases(candidate, ctx)
  if (!developedCandidate.ok) return developedCandidate
  candidate = developedCandidate.data

  const developedReferent = developTypeAliases(referent, ctx)
  if (!developedReferent.ok) return developedReferent
  referent = developedReferent.data

  if (referent.type === 'generic') {
    for (let s = ctx.resolvedGenerics.length - 1; s >= 0; s--) {
      const generic = getResolvedGenericInSingleScope(ctx.resolvedGenerics[s], referent.name.parsed, referent.orig)

      if (generic !== undefined) {
        if (generic.mapped === null) {
          generic.mapped = candidate
          return success(void 0)
        } else {
          return subCheck({ candidate, referent: generic.mapped })
        }
      }
    }

    // If not found, it means we are in a function body and generics are not resolvable yet
  } else {
    if (candidate.type === 'nullable') {
      return referent.type !== 'nullable'
        ? expectationErr()
        : subCheck({ addPath: 'nullable type', candidate: candidate.inner, referent: referent.inner })
    } else if (referent.type === 'nullable') {
      return subCheck({ addPath: 'nullable type', candidate, referent: referent.inner })
    }
  }

  if (candidate.type === 'generic') {
    if (fillKnownGenerics) {
      const set = getResolvedGenericInSingleScope(fillKnownGenerics, candidate.name.parsed, candidate.orig)

      if (set === undefined) {
        return expectationErr('internal error: candidate generic is unknown although filling map was provided')
      }

      if (set.mapped === null) {
        set.mapped = referent
        return success(void 0)
      } else {
        const compat = subCheck({ candidate: referent, referent: set.mapped, referentAt: at })

        if (!compat.ok) return compat
      }
    } else {
      const resolved = resolveGenerics(candidate, ctx.resolvedGenerics)

      if (isResolvedGenericDifferent(resolved, candidate)) {
        return subCheck({ candidate: resolved, referent })
      }
    }
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
    list: (c, r) => subCheck({ addPath: 'list', candidate: c.itemsType, referent: r.itemsType }),
    map: (c, r) => subCheck({ addPath: 'map', candidate: c.itemsType, referent: r.itemsType }),
    struct: (c, r) => {
      const candidateMembers = new Map(c.members.map(({ name, type }) => [name, type]))
      const referentMembers = new Map(r.members.map(({ name, type }) => [name, type]))

      for (const [name, type] of referentMembers.entries()) {
        const candidateMember = candidateMembers.get(name)

        if (!candidateMember) {
          return expectationErr(`missing member \`${name}\``)
        }

        const comparison = subCheck({ addPath: '.' + name, candidate: candidateMember, referent: type })
        if (!comparison.ok) return comparison
      }

      for (const name of candidateMembers.keys()) {
        if (!referentMembers.has(name)) {
          return expectationErr(`member \`${name}\` is provided but not expected`)
        }
      }

      return success(void 0)
    },

    enum: (c, r) => {
      for (const name of r.variants) {
        if (!c.variants.find((variant) => variant.parsed === name.parsed)) {
          return expectationErr(`missing variant \`${name.parsed}\``)
        }
      }

      for (const name of c.variants) {
        if (!r.variants.find((variant) => variant.parsed === name.parsed)) {
          return expectationErr(`member \`${name.parsed}\` is provided but not expected`)
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

        const compat = subCheck({
          candidate: getFnDeclArgType(cArg),
          referent: getFnDeclArgType(rArg),
          referentAt: rArgAt,
        })
        if (!compat.ok) return compat
      }

      if (r.fnType.args.length > c.fnType.args.length) {
        return expectationErr(`argument \`${r.fnType.args[c.fnType.args.length].parsed.name.parsed}\` is missing`)
      }

      if (c.fnType.returnType) {
        if (!r.fnType.returnType) {
          return expectationErr(`function was not expected to have a return type`, c.fnType.returnType.at)
        }

        const retTypeCompat = subCheck({
          candidate: c.fnType.returnType.parsed,
          // candidateAt: c.fnType.returnType.at,
          referent: r.fnType.returnType.parsed,
          referentAt: r.fnType.returnType.at,
        })

        if (!retTypeCompat.ok) return retTypeCompat
      } else if (r.fnType.returnType) {
        return expectationErr(`function was expected to have a return type`)
      }

      if (c.fnType.restArg && !r.fnType.restArg) {
        return expectationErr('function was not expected to have a rest argument', c.fnType.restArg.at)
      } else if (!c.fnType.restArg && r.fnType.restArg) {
        return expectationErr('function was expected to have a rest argument')
      }

      return success(void 0)
    },

    failable: (c, r) => {
      const successCheck = subCheck({
        candidate: c.successType.parsed,
        // candidateAt: c.successType.at,
        referent: r.successType.parsed,
        referentAt: r.successType.at,
      })

      if (!successCheck.ok) return successCheck

      const failureCheck = subCheck({
        candidate: c.failureType.parsed,
        // candidateAt: c.failureType.at,
        referent: r.failureType.parsed,
        referentAt: r.failureType.at,
      })

      if (!failureCheck.ok) return failureCheck

      return success(void 0)
    },

    generic: (c, r) => {
      return c.name.parsed !== r.name.parsed
        ? expectationErr(`expected generic \`${r.name.parsed}\`, found generic \`${c.name.parsed}\``)
        : isLocEq(c.orig.start, r.orig.start)
        ? success(void 0)
        : expectationErr(
            `expected generic \`${r.name.parsed}\`, found another generic named \`${c.name.parsed}\``,
            undefined,
            [
              { at: r.orig, message: 'expected this generic' },
              { at: c.orig, message: 'found this generic' },
            ]
          )
    },

    aliasRef: () => expectationErr('internal error: unreachable "aliasRef" type comparison'),
    unknown: () => expectationErr('internal error: unreachable "unknown" type comparison'),
    nullable: () => expectationErr('internal error: unreachable "nullable" type comparison'),

    // Internal types
    void: () => expectationErr('internal error: trying to compare candidate with internal type "void"'),
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
  return comparators[candidate.type](candidate as any, referent as any)
}
