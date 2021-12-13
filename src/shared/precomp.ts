import { FnType, ValueType } from './ast'
import { isLocEq } from './loc-cmp'
import { CodeSection } from './parsed'

export type PrecompData = {
  typeAliases: Map<string, { at: CodeSection; content: ValueType }>
  callbackTypes: LocatedPrecomp<FnType>
  fnCallGenerics: LocatedPrecomp<Map<string, ValueType>>
}

export type LocatedPrecomp<T> = Array<{ at: CodeSection; data: T }>

export function getLocatedPrecomp<T>(loc: CodeSection, candidates: LocatedPrecomp<T>): T | undefined {
  const result = candidates.find(
    (candidate) => isLocEq(loc.start, candidate.at.start) && isLocEq(loc.next, candidate.at.next)
  )

  return result !== undefined ? result.data : result
}
