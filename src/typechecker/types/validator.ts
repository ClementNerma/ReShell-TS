import { matchUnion } from '../../parsers/utils'
import { ValueType } from '../../shared/parsed'
import { success, TypecheckerRaw, TypecheckerResult } from '../base'
import { Scope } from '../scope/first-pass'
import { getTypeAliasInScope } from '../scope/search'

export const typeValidator: TypecheckerRaw<ValueType, Scope[], void> = (type, parents) =>
  matchUnion(type.inner)<TypecheckerResult<void>>('type', {
    void: () => success(void 0),
    bool: () => success(void 0),
    number: () => success(void 0),
    string: () => success(void 0),
    path: () => success(void 0),
    list: ({ itemsType }) => typeValidator(itemsType, parents),
    map: ({ itemsType }) => typeValidator(itemsType, parents),
    fn: ({ fnType }) =>
      multiTypeValidator(
        fnType.args
          .map((arg) => arg.type)
          .concat(fnType.returnType ? [fnType.returnType] : [])
          .concat(fnType.failureType ? [fnType.failureType] : []),
        parents
      ),
    struct: ({ members }) =>
      multiTypeValidator(
        members.map(({ type }) => type),
        parents
      ),
    aliasRef: ({ typeAliasName }) => {
      const typeAlias = getTypeAliasInScope([typeAliasName.parsed, typeAliasName.start], parents)
      return typeAlias.ok ? success(void 0) : typeAlias
    },
    unknown: () => success(void 0),

    // Internal types
    implicit: () => success(void 0),
  })

export const multiTypeValidator: TypecheckerRaw<ValueType[], Scope[], void> = (types, parents) => {
  for (const type of types) {
    const validation = typeValidator(type, parents)
    if (!validation.ok) return validation
  }

  return success(void 0)
}
