import { ValueType } from '../../shared/ast'
import { err, success, Typechecker, TypecheckerResult } from '../base'

export const developTypeAliases: Typechecker<ValueType, ValueType> = (type, ctx) => {
  while (type.type === 'aliasRef') {
    const alias = ctx.typeAliases.get(type.typeAliasName.parsed)

    if (!alias) {
      return err(type.typeAliasName.at, 'internal error: type alias not found during aliases development')
    }

    type = alias.content
  }

  return success(type)
}

export const developTypeAliasesIn: Typechecker<TypecheckerResult<ValueType>, ValueType> = (typeResult, ctx) =>
  typeResult.ok ? developTypeAliases(typeResult.data, ctx) : typeResult
