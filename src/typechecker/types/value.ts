import { CodeSection, PrimitiveTypes, StructTypeMember, Token, Value, ValueType } from '../../shared/parsed'
import { matchUnion } from '../../shared/utils'
import { ensureCoverage, err, success, Typechecker, TypecheckerContext, TypecheckerResult } from '../base'
import { getFunctionInScope, getTypeAliasInScope, getVariableInScope } from '../scope/search'
import { isTypeCompatible } from './compat'
import { resolveExprType } from './expr'
import { rebuildType } from './rebuilder'

export const resolveValueType: Typechecker<Token<Value>, ValueType> = (value, ctx) => {
  let { typeExpectation } = ctx

  if (typeExpectation?.type?.inner.type === 'aliasRef') {
    const alias = getTypeAliasInScope(typeExpectation.type.inner.typeAliasName, ctx)

    if (!alias.ok) {
      return err(value.at, 'Internal error: type alias reference not found in scope during value type resolution')
    }

    typeExpectation = {
      from: typeExpectation.from,
      type: {
        nullable: typeExpectation.type.nullable || alias.data.content.nullable,
        inner: alias.data.content.inner,
      },
    }
  }

  const assertExpectedType = (type: PrimitiveTypes['type']): TypecheckerResult<ValueType> =>
    typeExpectation && typeExpectation.type.inner.type !== type
      ? typeExpectation.type.inner.type !== 'unknown'
        ? errIncompatibleValueType({
            typeExpectation,
            foundType: type,
            valueAt: value.at,
          })
        : success(typeExpectation.type)
      : success({ nullable: false, inner: { type } })

  const assertExpectedNonPrimitiveType = <T extends Exclude<ValueType['inner']['type'], PrimitiveTypes['type']>>(
    type: T
  ): TypecheckerResult<Extract<ValueType['inner'], { type: T }> | void> =>
    typeExpectation && typeExpectation.type.inner.type !== 'unknown'
      ? typeExpectation.type.inner.type !== type
        ? errIncompatibleValueType({
            typeExpectation,
            foundType: type,
            valueAt: value.at,
          })
        : success(typeExpectation.type.inner as Extract<ValueType['inner'], { type: T }>)
      : success(void 0)

  return matchUnion(value.parsed, 'type', {
    null: () => {
      if (!typeExpectation) {
        return err(value.at, {
          message: 'Cannot determine the type of this value',
          complements: [
            ['Tip', 'Usage of "null" values require to be able to determine the type of the parent expression'],
          ],
        })
      }

      if (!typeExpectation.type.nullable) {
        return err(value.at, {
          message: 'Unexpected usage of "null" value ; type is not nullable',
          complements: [
            ['Expected', rebuildType(typeExpectation.type)],
            ['Found', 'void'],
          ],
        })
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

      const foundType: ValueType = { nullable: false, inner: { type: 'string' } }

      for (const segment of segments) {
        switch (segment.parsed.type) {
          case 'literal':
            break

          case 'expr':
            const exprType = resolveExprType(segment.parsed.expr, {
              ...ctx,
              typeExpectation: {
                type: foundType,
                from: null,
              },
            })

            if (!exprType.ok) return exprType
            break

          default:
            return ensureCoverage(segment.parsed)
        }
      }

      return success(foundType)
    },

    computedPath: ({ segments }) => {
      const assert = assertExpectedType('path')
      if (!assert.ok) return assert

      const foundType: ValueType = { nullable: false, inner: { type: 'path' } }

      for (const segment of segments) {
        switch (segment.parsed.type) {
          case 'separator':
          case 'literal':
            break

          case 'expr':
            const exprType = resolveExprType(segment.parsed.expr, {
              ...ctx,
              typeExpectation: {
                type: foundType,
                from: null,
              },
            })

            if (!exprType.ok) return exprType
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
          ? success(typeExpectation.type)
          : err(value.at, 'Unable to determine the type of this list')
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
          typeExpectation: expectedItemType
            ? {
                type: referenceType.data,
                from: typeExpectation?.from ?? null,
              }
            : null,
        })
        if (!itemType.ok) return itemType
      }

      return success<ValueType>(
        typeExpectation?.type ?? { nullable: false, inner: { type: 'list', itemsType: referenceType.data } }
      )
    },

    map: ({ type, entries }) => {
      const assert = assertExpectedNonPrimitiveType(type)
      if (!assert.ok) return assert

      const expectedMapType = assert.data

      if (entries.length === 0) {
        return typeExpectation
          ? success(typeExpectation.type)
          : err(value.at, 'Unable to determine the type of this map')
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
            message: 'A key with this name was already declared above',
            also: [{ at: duplicate.at, message: 'Original declaration occurs here' }],
          })
        }

        keys.set(key.parsed, key)

        const itemType = resolveExprType(value, {
          ...ctx,
          typeExpectation: expectedItemType
            ? {
                type: referenceType.data,
                from: typeExpectation?.from ?? null,
              }
            : null,
        })
        if (!itemType.ok) return itemType
      }

      return success<ValueType>(
        typeExpectation?.type ?? { nullable: false, inner: { type: 'map', itemsType: referenceType.data } }
      )
    },

    struct: ({ type, members }) => {
      const assert = assertExpectedNonPrimitiveType(type)
      if (!assert.ok) return assert

      if (members.length === 0) {
        return typeExpectation
          ? success(typeExpectation.type)
          : err(value.at, 'Unable to determine the type of this struct')
      }

      let expectedMembers: Map<string, ValueType> | null = null

      if (typeExpectation) {
        if (typeExpectation.type.inner.type !== 'struct') {
          return errIncompatibleValueType({ typeExpectation, foundType: 'struct', valueAt: value.at })
        }

        expectedMembers = new Map()

        for (const { name, type } of typeExpectation.type.inner.members) {
          expectedMembers.set(name, type)
        }
      }

      const memberNames = new Map<string, Token<string>>()
      const outputTypes: StructTypeMember[] = []

      for (const { name, value } of members) {
        const duplicate = memberNames.get(name.parsed)

        if (duplicate) {
          return err(name.at, {
            message: 'A member with this name was already declared above',
            also: [{ at: duplicate.at, message: 'Original declaration occurs here' }],
          })
        }

        memberNames.set(name.parsed, name)

        let resolvedType: TypecheckerResult<ValueType>

        if (expectedMembers) {
          const expectedMemberType = expectedMembers.get(name.parsed)

          if (!expectedMemberType) {
            return err(name.at, {
              message: `Unknown member "${name.parsed}"`,
              complements: [['Expected', rebuildType(typeExpectation!.type)]],
              also: typeExpectation!.from
                ? [
                    {
                      at: typeExpectation!.from,
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
              from: typeExpectation?.from ?? null,
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
            return err(value.at, `Member "${name}" is missing`)
          }
        }
      }

      return success<ValueType>(
        typeExpectation?.type ?? { nullable: false, inner: { type: 'struct', members: outputTypes } }
      )
    },

    closure: ({ type, fnType, body }) => {
      const assert = assertExpectedNonPrimitiveType('fn')
      if (!assert.ok) return assert

      throw new Error('// TODO: values => closure')
    },

    fnCall: ({ type, name, args }) => {
      throw new Error('// TODO: values => fnCall')
    },

    inlineCmdCallSequence: ({ start, sequence, capture }) => {
      throw new Error('// TODO: values => inlineCmdCallSequence')
    },

    reference: ({ varname }) => {
      const referencedVar = getVariableInScope(varname, ctx)
      const referencedFn = getFunctionInScope(varname, ctx)

      let foundType: ValueType

      if (referencedVar.ok) {
        foundType = referencedVar.data.content.type
      } else if (referencedFn.ok) {
        foundType = { nullable: false, inner: { type: 'fn', fnType: referencedFn.data.content } }
      } else {
        return err(value.at, `Referenced variable "${varname.parsed}" was not found in this scope`)
      }

      if (!typeExpectation) {
        return success(foundType)
      }

      const compat = isTypeCompatible({ candidate: foundType, at: varname.at }, ctx)
      if (!compat.ok) return compat

      return success(typeExpectation.type)
    },
  })
}

export const errIncompatibleValueType = ({
  message,
  typeExpectation,
  foundType,
  valueAt,
}: {
  message?: string
  typeExpectation: Exclude<TypecheckerContext['typeExpectation'], null>
  foundType: ValueType | ValueType['inner']['type']
  valueAt: CodeSection
}) => {
  const expectedNoDepth = rebuildType(typeExpectation.type, true)
  const foundNoDepth = typeof foundType === 'string' ? foundType : rebuildType(foundType, true)

  const expected = rebuildType(typeExpectation.type)
  const found = typeof foundType === 'string' ? foundType : rebuildType(foundType)

  return err(valueAt, {
    message:
      message ??
      `expected \`${rebuildType(typeExpectation.type, true)}\`, found \`${
        typeof foundType === 'string' ? foundType : rebuildType(foundType, true)
      }\``,
    complements:
      expectedNoDepth !== expected || foundNoDepth !== found
        ? [
            ['Expected', rebuildType(typeExpectation.type)],
            ['Found   ', typeof foundType === 'string' ? foundType : rebuildType(foundType)],
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

// export const isStringifyableType = ({ nullable, inner: { type: typeType } }: ValueType) =>
//   !nullable && (typeType === 'number' || typeType === 'string')

// export const isTypeConvertibleToPath = ({ nullable, inner: { type: typeType } }: ValueType) =>
//   !nullable && (typeType === 'number' || typeType === 'string' || typeType === 'path')
