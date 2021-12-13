import { CodeSection, ValueType } from '../../shared/parsed'
import { err, success, Typechecker, TypecheckerResult } from '../base'
import { rebuildType } from './rebuilder'

export const isTypeCompatible: Typechecker<
  { candidate: ValueType; referent: ValueType; at: CodeSection; _path?: string[] },
  void
> = ({ candidate, referent, at, _path }, context) => {
  const expectationErr = (message?: string) => {
    const rebuiltReferentTypeNoDepth = rebuildType(referent, true)
    const rebuiltCandidateTypeNoDepth = rebuildType(candidate, true)

    const rebuiltReferentType = rebuildType(referent)
    const rebuiltCandidateType = rebuildType(candidate)

    return err(at, {
      message:
        (path.length > 0 ? path.join(' > ') + ' > ' : '') +
        (message ?? `expected \`${rebuiltReferentTypeNoDepth}\`, found \`${rebuiltCandidateTypeNoDepth}\``),
      complements:
        rebuiltReferentType !== rebuiltReferentTypeNoDepth || rebuiltCandidateType !== rebuiltCandidateTypeNoDepth
          ? [
              ['Expected', rebuildType(referent)],
              ['Found   ', rebuildType(candidate)],
            ]
          : [],
    })
  }

  const subCheck = (addPath: string | string[], candidate: ValueType, referent: ValueType) =>
    isTypeCompatible(
      { candidate, referent, at, _path: path.concat(Array.isArray(addPath) ? addPath : [addPath]) },
      context
    )

  const path = _path ?? []

  if (candidate.nullable && !referent.nullable) {
    return expectationErr('Value should not be nullable')
  }

  if (referent.inner.type === 'unknown') {
    return success(void 0)
  }

  if (candidate.inner.type === 'unknown') {
    return expectationErr()
  }

  if (candidate.inner.type === 'aliasRef' || referent.inner.type === 'aliasRef') {
    throw new Error('// TODO: type alias comparison')
  }

  if (candidate.inner.type !== referent.inner.type) {
    return expectationErr()
  }

  const comparators: {
    [type in ValueType['inner']['type']]: (
      candidate: Extract<ValueType['inner'], { type: type }>,
      referent: Extract<ValueType['inner'], { type: type }>
    ) => TypecheckerResult<void> // | boolean
  } = {
    void: () => success(void 0),
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

        const comparison = subCheck(['struct', '.' + name], candidateMember, type)
        if (!comparison.ok) return comparison
      }

      for (const [name, type] of candidateMembers.entries()) {
        if (!referentMembers.has(name)) {
          return expectationErr(`member \`${name}\` is provided but not expected`)
        }
      }

      return success(void 0)
    },
    fn: (c, r) => {
      throw new Error('// TODO: function type comparison')
    },
    aliasRef: (c, r) => {
      throw new Error('Internal error: trying to compare an alias ref')
    },
    implicit: () => {
      throw new Error('Internal error: trying to compare with an "implicit" type')
    },
    unknown: () => {
      throw new Error('Internal error: unreachable "unknown" type comparison')
    },
  }

  return comparators[candidate.inner.type](candidate.inner as any, referent.inner as any)

  //   const comparison = comparators[candidate.inner.type](candidate.inner as any, referent.inner as any)
  //   return comparison === true ? success(void 0) : comparison === false ? expectationErr() : comparison
}
