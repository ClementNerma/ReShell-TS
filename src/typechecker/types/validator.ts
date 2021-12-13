import { ValueType } from '../../shared/ast'
import { matchUnion } from '../../shared/utils'
import { success, Typechecker } from '../base'
import { getTypedEntityInScope } from '../scope/search'

export const typeValidator: Typechecker<ValueType, void> = (type, ctx) =>
  matchUnion(type, 'type', {
    bool: () => success(void 0),
    number: () => success(void 0),
    string: () => success(void 0),
    path: () => success(void 0),
    list: ({ itemsType }) => typeValidator(itemsType, ctx),
    map: ({ itemsType }) => typeValidator(itemsType, ctx),
    fn: ({ fnType }) =>
      multiTypeValidator(
        fnType.args
          .map((arg) => arg.parsed.type)
          .concat(fnType.returnType ? [fnType.returnType.parsed] : [])
          .concat(fnType.failureType ? [fnType.failureType.parsed] : []),
        ctx
      ),
    struct: ({ members }) =>
      multiTypeValidator(
        members.map(({ type }) => type),
        ctx
      ),
    enum: () => success(void 0),
    aliasRef: ({ typeAliasName }) => {
      const typeAlias = getTypedEntityInScope(typeAliasName, 'typeAlias', ctx)
      return typeAlias.ok ? success(void 0) : typeAlias
    },
    unknown: () => success(void 0),
    nullable: () => success(void 0),
    generic: ({ name }) => {
      const generic = getTypedEntityInScope(name, 'generic', ctx)
      return generic.ok ? success(void 0) : generic
    },

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
