import { FnCall, FnType, ValueType } from '../shared/ast'
import { err, GenericResolutionScope, success, Typechecker } from './base'
import { getEntityInScope } from './scope/search'
import { isTypeCompatible } from './types/compat'
import { validateAndRegisterFnCall } from './types/fn'
import { resolveGenerics } from './types/generics-resolver'
import { rebuildType } from './types/rebuilder'

export const resolveFnCallType: Typechecker<FnCall, ValueType> = ({ name, generics, args }, ctx) => {
  let fnType: FnType

  const entity = getEntityInScope(name, ctx)

  if (!entity.ok || entity.data.type === 'generic') {
    return err(name.at, `function \`${name.parsed}\` was not found in this scope`)
  }

  if (entity.data.type === 'fn') {
    fnType = entity.data.content
  } else {
    let type = entity.data.varType

    if (type.type === 'aliasRef') {
      const alias = ctx.typeAliases.get(type.typeAliasName.parsed)

      if (!alias) {
        return err(type.typeAliasName.at, 'internal error: type alias reference not found during value type resolution')
      }

      type = alias.content
    }

    if (type.type !== 'fn') {
      return err(
        name.at,
        `the name \`${name.parsed}\` refers to a non-function variable (found \`${rebuildType(type, true)}\`)`
      )
    }

    fnType = type.fnType
  }

  if (fnType.returnType === null) {
    return err(name.at, 'cannot call a function inside an expression when this function does not have a return type')
  }

  let resolvedGenerics: GenericResolutionScope = []

  if (ctx.typeExpectation && fnType.generics.length > 0) {
    resolvedGenerics = fnType.generics.map((g) => ({ name: g, orig: g.at, mapped: null }))

    const compat = isTypeCompatible(
      {
        at: name.at,
        candidate: fnType.returnType.parsed,
        typeExpectation: ctx.typeExpectation,
        fillKnownGenerics: resolvedGenerics,
      },
      ctx
    )

    if (!compat.ok) return compat
  }

  const fnCallCheck = validateAndRegisterFnCall(
    { at: name.at, nameAt: name.at, fnType, generics, args, resolvedGenerics },
    ctx
  )

  if (!fnCallCheck.ok) return fnCallCheck

  const [returnType, gScope] = fnCallCheck.data

  if (ctx.typeExpectation) {
    const compat = isTypeCompatible(
      {
        at: name.at,
        candidate: returnType,
        typeExpectation: {
          from: ctx.typeExpectation.from,
          type: resolveGenerics(ctx.typeExpectation.type, ctx.resolvedGenerics.concat([gScope])),
        },
      },
      ctx
    )

    if (!compat.ok) return compat
  }

  return success(returnType)
}
