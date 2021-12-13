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

export const developTypeAliasesAndNullables: Typechecker<ValueType, ValueType> = (type, ctx) => {
  for (;;) {
    if (type.type === 'aliasRef') {
      const developed = developTypeAliases(type, ctx)
      if (!developed.ok) return developed
      type = developed.data
    } else if (type.type === 'nullable' && type.inner.type === 'aliasRef') {
      const developed = developTypeAliases(type.inner, ctx)
      if (!developed.ok) return developed
      type = { type: 'nullable', inner: developed.data }
    } else {
      break
    }
  }

  return success(type)
}
