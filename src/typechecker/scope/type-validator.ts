import { ValueType } from '../../parsers/data'
import { matchUnion } from '../../parsers/utils'
import { err, success, TypecheckerArr, TypecheckerRaw } from '../base'
import { Scope } from './complete'

export const typeValidator: TypecheckerRaw<ValueType, Scope, void> = (type, scope) =>
  matchUnion(type.inner)('type', {
    void: () => success(void 0),
    bool: () => success(void 0),
    number: () => success(void 0),
    string: () => success(void 0),
    path: () => success(void 0),
    list: ({ itemsType }) => typeValidator(itemsType.parsed, scope),
    map: ({ itemsType }) => typeValidator(itemsType.parsed, scope),
    fn: ({ fnType }) =>
      multiTypeValidator(
        fnType.args
          .map((arg) => arg.parsed.type)
          .concat(fnType.returnType ? [fnType.returnType] : [])
          .concat(fnType.failureType ? [fnType.failureType] : []),
        scope
      ),
    struct: ({ members }) =>
      multiTypeValidator(
        members.parsed.map(({ type }) => type),
        scope
      ),
    aliasRef: ({ typeAliasName }) =>
      scope.typeAliases.has(typeAliasName.parsed)
        ? success(void 0)
        : err(`Unknown type name "${typeAliasName.parsed}"`, typeAliasName.start),
    unknown: () => success(void 0),
  })

export const multiTypeValidator: TypecheckerArr<ValueType, Scope, void> = (types, scope) => {
  for (const type of types) {
    const validation = typeValidator(type.parsed, scope)
    if (!validation.ok) return validation
  }

  return success(void 0)
}
