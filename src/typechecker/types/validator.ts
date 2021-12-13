import { matchUnion } from '../../parsers/utils'
import { ValueType } from '../../shared/parsed'
import { success, TypecheckerArr, TypecheckerRaw } from '../base'
import { Scope } from '../scope/first-pass'
import { getTypeAliasInScope } from '../scope/search'

export const typeValidator: TypecheckerRaw<ValueType, Scope[], void> = (type, parents) =>
  matchUnion(type.inner)('type', {
    void: () => success(void 0),
    bool: () => success(void 0),
    number: () => success(void 0),
    string: () => success(void 0),
    path: () => success(void 0),
    list: ({ itemsType }) => typeValidator(itemsType.parsed, parents),
    map: ({ itemsType }) => typeValidator(itemsType.parsed, parents),
    fn: ({ fnType }) =>
      multiTypeValidator(
        fnType.args
          .map((arg) => arg.parsed.type)
          .concat(fnType.returnType ? [fnType.returnType] : [])
          .concat(fnType.failureType ? [fnType.failureType] : []),
        parents
      ),
    struct: ({ members }) =>
      multiTypeValidator(
        members.parsed.map(({ type }) => type),
        parents
      ),
    aliasRef: ({ typeAliasName }) => {
      const typeAlias = getTypeAliasInScope([typeAliasName.parsed, typeAliasName.start], parents)
      return typeAlias.ok ? success(void 0) : typeAlias
    },
    unknown: () => success(void 0),
  })

export const multiTypeValidator: TypecheckerArr<ValueType, Scope[], void> = (types, parents) => {
  for (const type of types) {
    const validation = typeValidator(type.parsed, parents)
    if (!validation.ok) return validation
  }

  return success(void 0)
}
