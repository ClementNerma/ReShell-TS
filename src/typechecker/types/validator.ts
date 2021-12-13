import { ValueType } from '../../shared/ast'
import { matchUnion } from '../../shared/utils'
import { err, success, Typechecker } from '../base'
import { getTypedEntityInScope } from '../scope/search'
import { fnTypeValidator } from './fn'

export const typeValidator: Typechecker<ValueType, void> = (type, ctx) =>
  matchUnion(type, 'type', {
    bool: () => success(void 0),
    number: () => success(void 0),
    string: () => success(void 0),
    path: () => success(void 0),
    list: ({ itemsType }) => typeValidator(itemsType, ctx),
    map: ({ itemsType }) => typeValidator(itemsType, ctx),
    fn: ({ fnType }) => fnTypeValidator(fnType, ctx),
    struct: ({ members }) =>
      multiTypeValidator(
        members.map(({ type }) => type),
        ctx
      ),
    enum: () => success(void 0),
    aliasRef: ({ typeAliasName }) =>
      ctx.typeAliasesPrelook.has(typeAliasName.parsed)
        ? success(void 0)
        : err(typeAliasName.at, `type alias \`${typeAliasName.parsed}\` was not found`),
    unknown: () => success(void 0),
    nullable: ({ inner }) => typeValidator(inner, ctx),
    failable: ({ successType, failureType }) => {
      const successCheck = typeValidator(successType.parsed, ctx)
      if (!successCheck.ok) return successCheck

      const failureCheck = typeValidator(failureType.parsed, ctx)
      if (!failureCheck.ok) return failureCheck

      return success(void 0)
    },
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
