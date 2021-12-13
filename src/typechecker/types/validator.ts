import { ValueType } from '../../shared/parsed'
import { matchUnion } from '../../shared/utils'
import { success, Typechecker, TypecheckerResult } from '../base'
import { getTypeAliasInScope } from '../scope/search'

export const typeValidator: Typechecker<ValueType, void> = (type, ctx) =>
  matchUnion(type.inner)<TypecheckerResult<void>>('type', {
    bool: () => success(void 0),
    number: () => success(void 0),
    string: () => success(void 0),
    path: () => success(void 0),
    list: ({ itemsType }) => typeValidator(itemsType, ctx),
    map: ({ itemsType }) => typeValidator(itemsType, ctx),
    fn: ({ fnType }) =>
      multiTypeValidator(
        fnType.args
          .map((arg) => arg.type)
          .concat(fnType.returnType ? [fnType.returnType] : [])
          .concat(fnType.failureType ? [fnType.failureType] : []),
        ctx
      ),
    struct: ({ members }) =>
      multiTypeValidator(
        members.map(({ type }) => type),
        ctx
      ),
    aliasRef: ({ typeAliasName }) => {
      const typeAlias = getTypeAliasInScope(typeAliasName, ctx)
      return typeAlias.ok ? success(void 0) : typeAlias
    },
    unknown: () => success(void 0),

    // Internal types
    void: () => success(void 0),
  })

export const multiTypeValidator: Typechecker<ValueType[], void> = (types, ctx) => {
  for (const type of types) {
    const validation = typeValidator(type, ctx)
    if (!validation.ok) return validation
  }

  return success(void 0)
}
