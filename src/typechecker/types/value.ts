import { PrimitiveValueType, StructTypeMember, Value, ValueType } from '../../shared/ast'
import { CodeSection, Token } from '../../shared/parsed'
import { matchUnion } from '../../shared/utils'
import { ensureCoverage, err, success, Typechecker, TypecheckerContext, TypecheckerResult } from '../base'
import { inlineCmdCallChecker } from '../cmdcall'
import { enumMatchingTypechecker } from '../matching'
import { getContextuallyResolvedGeneric, getEntityInScope } from '../scope/search'
import { developTypeAliases, developTypeAliasesAndNullables } from './aliases'
import { isTypeCompatible } from './compat'
import { resolveExprType } from './expr'
import { closureCallValidator, resolveFnCallType } from './fn'
import { rebuildType } from './rebuilder'

export const resolveValueType: Typechecker<Token<Value>, ValueType> = (value, ctx) => {
  let { typeExpectation } = ctx

  if (typeExpectation?.type.type === 'generic' && ctx.inFnCallAt) {
    const generic = getContextuallyResolvedGeneric(ctx.resolvedGenerics, ctx.inFnCallAt, typeExpectation.type)

    if (generic?.mapped) {
      typeExpectation = { from: typeExpectation.from, type: generic.mapped }
    } else if (generic?.mapped === null) {
      const type = resolveValueType(value, { ...ctx, typeExpectation: null })
      if (!type.ok) return type

      generic.mapped = type.data
      return success(type.data)
    }
  }

  if (typeExpectation) {
    const developed = developTypeAliases(typeExpectation.type, ctx)
    if (!developed.ok) return developed
    typeExpectation = { from: typeExpectation.from, type: developed.data }
  }

  let developedExpectedType: ValueType | null = null

  if (typeExpectation) {
    const developed = developTypeAliasesAndNullables(typeExpectation.type, ctx)
    if (!developed.ok) return developed

    developedExpectedType = developed.data
  }

  const assertExpectedType = (type: PrimitiveValueType['type']): TypecheckerResult<ValueType> => {
    if (!typeExpectation || !developedExpectedType) return success({ type })

    return developedExpectedType.type === type || developedExpectedType.type === 'unknown'
      ? success({ type })
      : errIncompatibleValueType({
          typeExpectation,
          foundType: type,
          valueAt: value.at,
          ctx,
        })
  }

  const assertExpectedNonPrimitiveType = <T extends Exclude<ValueType['type'], PrimitiveValueType['type']>>(
    type: T
  ): TypecheckerResult<Extract<ValueType, { type: T }> | null> => {
    if (!typeExpectation || !developedExpectedType) return success(null)

    return developedExpectedType.type === type
      ? success(developedExpectedType as Extract<ValueType, { type: T }>)
      : developedExpectedType.type === 'unknown'
      ? success(null)
      : errIncompatibleValueType({
          typeExpectation,
          foundType: type,
          valueAt: value.at,
          ctx,
        })
  }

  return matchUnion(value.parsed, 'type', {
    null: () => {
      if (!typeExpectation) {
        return err(value.at, {
          message: 'cannot determine the type of this value',
          complements: [
            ['tip', 'usage of "null" values require to be able to determine the type of the parent expression'],
          ],
        })
      }

      if (typeExpectation.type.type !== 'nullable' && typeExpectation.type.type !== 'unknown') {
        return err(
          value.at,
          `expected non-nullable type \`${rebuildType(typeExpectation.type, { noDepth: true })}\`, found value "null"`
        )
      }

      return success(typeExpectation.type)
    },

    bool: ({ type }) => assertExpectedType(type),
    number: ({ type }) => assertExpectedType(type),
    string: ({ type }) => assertExpectedType(type),
    path: ({ type }) => assertExpectedType(type),

    computedString: ({ segments }) => {
      const assert = assertExpectedType('string')
      if (!assert.ok) return assert

      const foundType: ValueType = { type: 'string' }

      for (const segment of segments) {
        switch (segment.parsed.type) {
          case 'literal':
            break

          case 'expr': {
            const exprType = resolveExprType(segment.parsed.expr, { ...ctx, typeExpectation: null })
            if (!exprType.ok) return exprType

            if (exprType.data.type !== 'string' && exprType.data.type !== 'number' && exprType.data.type !== 'path') {
              return err(
                segment.at,
                `expected \`string\`, \`number\` or \`path\`, found \`${rebuildType(exprType.data, {
                  noDepth: true,
                })}\``
              )
            }

            break
          }

          case 'inlineCmdCall': {
            const callCheck = inlineCmdCallChecker(segment.parsed.content, ctx)
            if (callCheck.ok !== true) return callCheck
            break
          }

          default:
            return ensureCoverage(segment.parsed)
        }
      }

      return success(foundType)
    },

    computedPath: ({ segments }) => {
      const assert = assertExpectedType('path')
      if (!assert.ok) return assert

      const foundType: ValueType = { type: 'path' }
      let firstSegment = true
      let segmentHasContent = false
      let segmentHasInnerPath = false

      for (const segment of segments) {
        switch (segment.parsed.type) {
          case 'literal':
            segmentHasContent = true
            break

          case 'expr': {
            const exprType = resolveExprType(segment.parsed.expr, { ...ctx, typeExpectation: null })
            if (!exprType.ok) return exprType

            if (exprType.data.type === 'string') {
              segmentHasContent = true
            } else if (exprType.data.type === 'path') {
              if (segmentHasContent) {
                return err(segment.at, 'path values must be isolated in a single segment')
              }

              segmentHasContent = true
              segmentHasInnerPath = true
            } else {
              return err(
                segment.at,
                `expected a "string" or "path", found a ${rebuildType(exprType.data, { noDepth: true })}`
              )
            }

            break
          }

          case 'separator':
            if (!firstSegment && !segmentHasContent && !segmentHasInnerPath) {
              return err(segment.at, 'cannot use two path separators (/) one after the other')
            }

            segmentHasContent = false
            segmentHasInnerPath = false
            firstSegment = false

            break

          default:
            return ensureCoverage(segment.parsed)
        }
      }

      return success(foundType)
    },

    list: ({ type, items }) => {
      const assert = assertExpectedNonPrimitiveType(type)
      if (!assert.ok) return assert

      const expectedListType = assert.data

      if (items.length === 0) {
        return typeExpectation
          ? success({ type: 'list', itemsType: { type: 'unknown' } })
          : err(value.at, 'unable to determine the type of this list')
      }

      const expectedItemType: ValueType | null = expectedListType?.itemsType ?? null

      const referenceType = resolveExprType(items[0], {
        ...ctx,
        typeExpectation: expectedItemType
          ? {
              type: expectedItemType,
              from: typeExpectation?.from ?? null,
            }
          : null,
      })
      if (!referenceType.ok) return referenceType

      for (const item of items.slice(1)) {
        const itemType = resolveExprType(item, {
          ...ctx,
          typeExpectation: {
            type: referenceType.data,
            from: items[0]?.at ?? null,
          },
        })

        if (!itemType.ok) return itemType
      }

      return success<ValueType>({ type: 'list', itemsType: referenceType.data })
    },

    map: ({ type, entries }) => {
      const assert = assertExpectedNonPrimitiveType(type)
      if (!assert.ok) return assert

      const expectedMapType = assert.data

      if (entries.length === 0) {
        return typeExpectation
          ? success({ type: 'map', itemsType: { type: 'unknown' } })
          : err(value.at, 'unable to determine the type of this map')
      }

      const expectedItemType: ValueType | null = expectedMapType?.itemsType ?? null

      const referenceType = resolveExprType(entries[0].value, {
        ...ctx,
        typeExpectation: expectedItemType
          ? {
              type: expectedItemType,
              from: typeExpectation?.from ?? null,
            }
          : null,
      })
      if (!referenceType.ok) return referenceType

      const keys = new Map([[entries[0].key.parsed, entries[0].key]])

      for (const { key, value } of entries.slice(1)) {
        const duplicate = keys.get(key.parsed)

        if (duplicate) {
          return err(duplicate.at, {
            message: 'a key with this name was already declared above',
            also: [{ at: duplicate.at, message: 'original key name is used here' }],
          })
        }

        keys.set(key.parsed, key)

        const itemType = resolveExprType(value, {
          ...ctx,
          typeExpectation: {
            type: referenceType.data,
            from: entries[0]?.value.at ?? null,
          },
        })

        if (!itemType.ok) return itemType
      }

      return success<ValueType>({ type: 'map', itemsType: referenceType.data })
    },

    struct: ({ type, members }) => {
      const assert = assertExpectedNonPrimitiveType(type)
      if (!assert.ok) return assert

      if (members.length === 0) {
        return success({ type: 'struct', members: [] })
      }

      const expectedStructType = assert.data

      let expectedMembers: Map<string, ValueType> | null = null

      if (expectedStructType) {
        expectedMembers = new Map()

        for (const { name, type } of expectedStructType.members) {
          expectedMembers.set(name, type)
        }
      }

      const memberNames = new Map<string, Token<string>>()
      const outputTypes: StructTypeMember[] = []

      for (const { name, value } of members) {
        const duplicate = memberNames.get(name.parsed)

        if (duplicate) {
          return err(name.at, {
            message: 'a member with this name was already declared above',
            also: [{ at: duplicate.at, message: 'original member name is used here' }],
          })
        }

        memberNames.set(name.parsed, name)

        let resolvedType: TypecheckerResult<ValueType>

        if (expectedMembers) {
          const expectedMemberType = expectedMembers.get(name.parsed)

          if (typeExpectation === null) {
            return err(
              value.at,
              'internal error: got members expectation but no global type expectation in struct typechecker'
            )
          }

          if (!expectedMemberType) {
            return err(name.at, {
              message: `unknown member \`${name.parsed}\``,
              complements: [['expected', rebuildType(typeExpectation.type)]],
              also: typeExpectation.from
                ? [
                    {
                      at: typeExpectation.from,
                      message: 'type expectation originates here',
                    },
                  ]
                : [],
            })
          }

          resolvedType = resolveExprType(value, {
            ...ctx,
            typeExpectation: {
              type: expectedMemberType,
              from: typeExpectation.from ?? null,
            },
          })
        } else {
          resolvedType = resolveExprType(value, { ...ctx, typeExpectation: null })
        }

        if (!resolvedType.ok) return resolvedType
        outputTypes.push({ name: name.parsed, type: resolvedType.data })
      }

      if (expectedMembers) {
        for (const name of expectedMembers.keys()) {
          if (!memberNames.has(name)) {
            return err(value.at, `member \`${name}\` is missing`)
          }
        }
      }

      return success<ValueType>({ type: 'struct', members: outputTypes })
    },

    enumVariant: ({ enumName, variant }) => {
      const assert = assertExpectedNonPrimitiveType('enum')
      if (!assert.ok) return assert

      let variants: Token<string>[]

      if (enumName) {
        const enumTypeEntity = ctx.typeAliases.get(enumName.parsed)
        if (!enumTypeEntity) return err(enumName.at, `type alias \`${enumName.parsed}\` was not found`)

        if (enumTypeEntity.content.type !== 'enum') {
          return err(
            enumName.at,
            `this type is not an enumeration (found \`${rebuildType(enumTypeEntity.content, { noDepth: true })}\`)`
          )
        }

        variants = enumTypeEntity.content.variants
      } else if (assert.data) {
        variants = assert.data.variants
      } else {
        return err(variant.at, {
          message: 'cannot determine the enum type from this variant',
          complements: [['tip', 'consider adding the type name explicitly here: enum::EnumName.' + variant.parsed]],
        })
      }

      if (enumName && assert.data) {
        for (const variant of variants) {
          if (!assert.data.variants.find((v) => v.parsed === variant.parsed)) {
            return err(variant.at, {
              message: `incompatible enum types: variant \`${variant.parsed}\` does not exist in expected type`,
              complements: [
                ['found variants', variants.map((v) => v.parsed).join(', ')],
                ['expected variants', assert.data.variants.map((v) => v.parsed).join(', ')],
              ],
            })
          }
        }

        for (const variant of assert.data.variants) {
          if (!variants.find((v) => v.parsed === variant.parsed)) {
            return err(variant.at, {
              message: `incompatible enum types: variant \`${variant.parsed}\` does not exist in provided type`,
              complements: [
                ['found variants', variants.map((v) => v.parsed).join(', ')],
                ['expected variants', assert.data.variants.map((v) => v.parsed).join(', ')],
              ],
            })
          }
        }
      }

      if (!variants.find((v) => v.parsed === variant.parsed)) {
        return err(variant.at, {
          message: 'variant not found in enum',
          complements: [['variants', variants.map((v) => v.parsed).join(', ')]],
        })
      }

      return success({ type: 'enum', variants })
    },

    match: ({ subject, arms }) => {
      // FIX: required because of a TypeScript compiler bug eliminating the object type when assigning "null"
      const opaque = <T>(value: null): T | null => value

      let exprType: { from: CodeSection; type: ValueType } | null = opaque(null)

      const check = enumMatchingTypechecker(
        subject,
        arms,
        ctx,
        (matchWith) =>
          resolveExprType(matchWith, {
            ...ctx,
            typeExpectation: ctx.typeExpectation || !exprType ? ctx.typeExpectation : exprType,
          }),
        (type, matchWith) => {
          exprType ??= { from: matchWith.at, type }
        }
      )

      if (!check.ok) return check

      if (exprType === null) {
        return err(subject.at, 'unable to determine the type of this match expression')
      }

      return success(exprType.type)
    },

    // closure: ({ fnType, body }) => {
    //   const assert = assertExpectedNonPrimitiveType('fn')
    //   if (!assert.ok) return assert

    //   const check = fnTypeValidator(fnType, ctx)
    //   if (!check.ok) return check

    //   const stmtCheck = statementChainChecker(body.parsed, {
    //     ...ctx,
    //     scopes: ctx.scopes.concat([fnScopeCreator(fnType)]),
    //     fnExpectation: {
    //       failureType: fnType.failureType ? { type: fnType.failureType.parsed, from: fnType.failureType.at } : null,
    //       returnType: fnType.returnType ? { type: fnType.returnType.parsed, from: fnType.returnType.at } : null,
    //     },
    //   })

    //   if (!stmtCheck.ok) return stmtCheck

    //   if (fnType.returnType !== null && !stmtCheck.data.neverEnds) {
    //     return err(body.at, 'not all code paths return a value')
    //   }

    //   return success({ type: 'fn', fnType })
    // },

    callback: ({ args, restArg, body }) => {
      const assert = assertExpectedNonPrimitiveType('fn')
      if (!assert.ok) return assert
      if (!assert.data) return err(value.at, 'cannot determine the signature of this function')

      const expected = assert.data.fnType

      const check = closureCallValidator({ at: value.at, args, restArg, body, expected }, ctx)

      if (!check.ok) return check

      ctx.callbackTypes.push({ at: value.at, data: expected })

      return success({ type: 'fn', fnType: expected })
    },

    fnCall: ({ content }) => {
      const returnType = resolveFnCallType(content, ctx)
      if (!returnType.ok) return returnType

      return returnType.data.type === 'void'
        ? err(
            content.name.at,
            'cannot call a function inside an expression when this function does not have a return type'
          )
        : success(returnType.data)
    },

    inlineCmdCall: ({ content }) => {
      const foundType = assertExpectedType('string')
      if (!foundType.ok) return foundType

      const check = inlineCmdCallChecker(content, ctx)
      if (!check.ok) return check

      return success(foundType.data)
    },

    reference: ({ varname }) => {
      const referenced = getEntityInScope(varname, ctx)

      let foundType: ValueType

      if (referenced.ok && referenced.data.type === 'var') {
        foundType = referenced.data.varType
      } else if (referenced.ok && referenced.data.type === 'fn') {
        foundType = { type: 'fn', fnType: referenced.data.content }
      } else {
        return err(value.at, `variable \`${varname.parsed}\` was not found in this scope`)
      }

      if (!typeExpectation) {
        return success(foundType)
      }

      const compat = isTypeCompatible({ candidate: foundType, at: varname.at, typeExpectation }, ctx)
      if (!compat.ok) return compat

      return success(typeExpectation.type)
    },
  })
}

export const errIncompatibleValueType = ({
  typeExpectation,
  foundType,
  valueAt,
  ctx,
}: {
  typeExpectation: Exclude<TypecheckerContext['typeExpectation'], null>
  foundType: ValueType | ValueType['type']
  valueAt: CodeSection
  ctx: TypecheckerContext
}) => {
  const expectedNoDepth = rebuildType(typeExpectation.type, { noDepth: true })
  const foundNoDepth = typeof foundType === 'string' ? foundType : rebuildType(foundType, { noDepth: true })

  const expected = rebuildType(typeExpectation.type)
  const found = typeof foundType === 'string' ? foundType : rebuildType(foundType)

  return err(valueAt, {
    message: `expected ${ctx.typeExpectationNature !== null ? ctx.typeExpectationNature + ' ' : ''}\`${rebuildType(
      typeExpectation.type,
      { noDepth: true }
    )}\`, found \`${typeof foundType === 'string' ? foundType : rebuildType(foundType, { noDepth: true })}\``,
    complements:
      expectedNoDepth !== expected || foundNoDepth !== found
        ? [
            ['expected', rebuildType(typeExpectation.type)],
            ['found   ', typeof foundType === 'string' ? foundType : rebuildType(foundType)],
          ]
        : [],
    also: typeExpectation.from
      ? [
          {
            at: typeExpectation.from,
            message: 'type expectation originates here',
          },
        ]
      : [],
  })
}
