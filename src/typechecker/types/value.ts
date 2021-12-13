import { FnType, PrimitiveValueType, StructTypeMember, Value, ValueType } from '../../shared/ast'
import { CodeSection, Token } from '../../shared/parsed'
import { matchUnion } from '../../shared/utils'
import { ensureCoverage, err, success, Typechecker, TypecheckerContext, TypecheckerResult } from '../base'
import { cmdCallTypechecker } from '../cmdcall'
import { getFunctionInScope, getTypeAliasInScope, getVariableInScope } from '../scope/search'
import { statementChainChecker } from '../statement'
import { isTypeCompatible } from './compat'
import { resolveExprType } from './expr'
import { closureTypeValidator, fnScopeCreator, fnTypeValidator, validateFnCallArgs } from './fn'
import { rebuildType } from './rebuilder'

export const resolveValueType: Typechecker<Token<Value>, ValueType> = (value, ctx) => {
  let { typeExpectation } = ctx

  while (typeExpectation?.type?.type === 'aliasRef') {
    const alias = getTypeAliasInScope(typeExpectation.type.typeAliasName, ctx)

    if (!alias.ok) {
      return err(value.at, 'internal error: type alias reference not found in scope during value type resolution')
    }

    typeExpectation = { from: typeExpectation.from, type: alias.data.content }
  }

  const assertExpectedType = (type: PrimitiveValueType['type']): TypecheckerResult<ValueType> => {
    if (!typeExpectation) return success({ type })

    let expected: ValueType = typeExpectation.type

    while (expected.type === 'nullable') {
      expected = expected.inner
    }

    return expected.type === type || expected.type === 'unknown'
      ? success(typeExpectation.type)
      : errIncompatibleValueType({
          typeExpectation,
          foundType: type,
          valueAt: value.at,
          ctx,
        })
  }

  const assertExpectedNonPrimitiveType = <T extends Exclude<ValueType['type'], PrimitiveValueType['type']>>(
    type: T
  ): TypecheckerResult<Extract<ValueType, { type: T }> | void> => {
    if (!typeExpectation) return success(void 0)

    let expected: ValueType = typeExpectation.type

    while (expected.type === 'nullable') {
      expected = expected.inner
    }

    return expected.type === type || expected.type === 'unknown'
      ? success(expected as Extract<ValueType, { type: T }>)
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

      if (typeExpectation.type.type !== 'nullable') {
        return err(value.at, {
          message: 'parent type is not nullable',
          complements: [
            ['expected', rebuildType(typeExpectation.type)],
            ['found   ', 'void'],
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

      const foundType: ValueType = { type: 'string' }

      for (const segment of segments) {
        switch (segment.parsed.type) {
          case 'literal':
            break

          case 'expr':
            const exprType = resolveExprType(segment.parsed.expr, { ...ctx, typeExpectation: null })
            if (!exprType.ok) return exprType

            if (exprType.data.type !== 'string' && exprType.data.type !== 'number') {
              return err(segment.at, `expected \`string\` or \`number\`, found \`${rebuildType(exprType.data, true)}\``)
            }

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

      const foundType: ValueType = { type: 'path' }

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
            from: items[0].at ?? null,
          },
        })

        if (!itemType.ok) return itemType
      }

      return success<ValueType>(typeExpectation?.type ?? { type: 'list', itemsType: referenceType.data })
    },

    map: ({ type, entries }) => {
      const assert = assertExpectedNonPrimitiveType(type)
      if (!assert.ok) return assert

      const expectedMapType = assert.data

      if (entries.length === 0) {
        return typeExpectation
          ? success(typeExpectation.type)
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
            from: entries[0].value.at ?? null,
          },
        })

        if (!itemType.ok) return itemType
      }

      return success<ValueType>(typeExpectation?.type ?? { type: 'map', itemsType: referenceType.data })
    },

    struct: ({ type, members }) => {
      const assert = assertExpectedNonPrimitiveType(type)
      if (!assert.ok) return assert

      if (members.length === 0) {
        return typeExpectation
          ? success(typeExpectation.type)
          : err(value.at, 'unable to determine the type of this struct')
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

          if (!expectedMemberType) {
            return err(name.at, {
              message: `unknown member \`${name.parsed}\``,
              complements: [['expected', rebuildType(typeExpectation!.type)]],
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
            return err(value.at, `member \`${name}\` is missing`)
          }
        }
      }

      return success<ValueType>(typeExpectation?.type ?? { type: 'struct', members: outputTypes })
    },

    closure: ({ fnType, body }) => {
      const assert = assertExpectedNonPrimitiveType('fn')
      if (!assert.ok) return assert

      const check = fnTypeValidator(fnType, ctx)
      if (!check.ok) return check

      const stmtCheck = statementChainChecker(body, {
        ...ctx,
        scopes: ctx.scopes.concat([fnScopeCreator(fnType)]),
        fnExpectation: {
          failureType: fnType.failureType ? { type: fnType.failureType.parsed, from: fnType.failureType.at } : null,
          returnType: fnType.returnType ? { type: fnType.returnType.parsed, from: fnType.returnType.at } : null,
        },
      })

      if (!stmtCheck.ok) return stmtCheck

      if (fnType.returnType !== null && !stmtCheck.data.neverEnds) {
        return err(fnType.returnType.at, 'not all code paths return a value')
      }

      return success({ type: 'fn', fnType })
    },

    callback: ({ args, body }) => {
      const assert = assertExpectedNonPrimitiveType('fn')
      if (!assert.ok) return assert
      if (!assert.data) return err(value.at, 'cannot determine the signature of this function')

      const expected = assert.data.fnType

      const check = closureTypeValidator({ at: value.at, args, body, expected }, ctx)
      return check.ok ? success({ type: 'fn', fnType: expected }) : check
    },

    fnCall: ({ name, args }) => {
      let fnType: FnType

      const fn = getFunctionInScope(name, ctx)

      if (fn.ok) {
        fnType = fn.data.content
      } else {
        const varType = getVariableInScope(name, ctx)

        if (!varType.ok) {
          return err(name.at, `function \`${name.parsed}\` was not found in this scope`)
        }

        let type = varType.data.content.type

        if (type.type === 'aliasRef') {
          const alias = getTypeAliasInScope(type.typeAliasName, ctx)

          if (!alias.ok) {
            return err(value.at, 'internal error: type alias reference not found in scope during value type resolution')
          }

          type = alias.data.content
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
        return err(
          name.at,
          'cannot call a function inside an expression when this function does not have a return type'
        )
      }

      if (ctx.typeExpectation) {
        const compat = isTypeCompatible(
          { at: name.at, candidate: fnType.returnType.parsed, typeExpectation: ctx.typeExpectation },
          ctx
        )
        if (!compat.ok) return compat
      }

      const validator = validateFnCallArgs({ at: name.at, fnType, args }, ctx)
      if (!validator.ok) return validator

      return success(fnType.returnType.parsed)
    },

    inlineCmdCallSequence: ({ start, sequence }) => {
      const foundType = assertExpectedType('string')
      if (!foundType.ok) return foundType

      const check = cmdCallTypechecker(start.parsed, ctx)
      if (!check.ok) return check

      for (const sub of sequence) {
        const check = cmdCallTypechecker(sub.parsed.chainedCmdCall.parsed, ctx)
        if (!check.ok) return check
      }

      return success(foundType.data)
    },

    reference: ({ varname }) => {
      const referencedVar = getVariableInScope(varname, ctx)
      const referencedFn = getFunctionInScope(varname, ctx)

      let foundType: ValueType

      if (referencedVar.ok) {
        foundType = referencedVar.data.content.type
      } else if (referencedFn.ok) {
        foundType = { type: 'fn', fnType: referencedFn.data.content }
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
  const expectedNoDepth = rebuildType(typeExpectation.type, true)
  const foundNoDepth = typeof foundType === 'string' ? foundType : rebuildType(foundType, true)

  const expected = rebuildType(typeExpectation.type)
  const found = typeof foundType === 'string' ? foundType : rebuildType(foundType)

  return err(valueAt, {
    message: `expected ${ctx.typeExpectationNature ? ctx.typeExpectationNature + ' ' : ''}\`${rebuildType(
      typeExpectation.type,
      true
    )}\`, found \`${typeof foundType === 'string' ? foundType : rebuildType(foundType, true)}\``,
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
