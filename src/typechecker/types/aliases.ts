import { ValueType } from '../../shared/ast'
import { err, success, Typechecker, TypecheckerResult } from '../base'

export const developTypeAliases: Typechecker<ValueType, ValueType> = (type, ctx) => {
  const encountered: string[] = []

  while (type.type === 'aliasRef') {
    const name = type.typeAliasName.parsed

    const alias = ctx.typeAliases.get(name)

    if (!alias) {
      return err(type.typeAliasName.at, 'internal error: type alias not found during aliases development')
    }

    if (encountered.includes(name)) {
      return err(type.typeAliasName.at, {
        message: 'this type alias is cyclic',
        complements: [['cycled at path', encountered.concat([name]).join(' -> ')]],
      })
    }

    encountered.push(name)

    type = alias.content
  }

  return success(type)
}

export const developTypeAliasesIn: Typechecker<TypecheckerResult<ValueType>, ValueType> = (typeResult, ctx) =>
  typeResult.ok ? developTypeAliases(typeResult.data, ctx) : typeResult
