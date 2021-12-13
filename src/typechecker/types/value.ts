import { formattableExtract } from '../../shared/errors'
import { StructTypeMember, Token, Value, ValueType } from '../../shared/parsed'
import { matchUnion } from '../../shared/utils'
import { ensureCoverage, err, success, Typechecker, TypecheckerResult } from '../base'
import { getFunctionInScope, getVariableInScope } from '../scope/search'
import { resolveExprType } from './expr'
import { rebuildType } from './rebuilder'

export const resolveValueType: Typechecker<Token<Value>, ValueType> = (value, ctx) => {
  const { expectedType } = ctx

  if (expectedType?.inner.type === 'implicit') {
    return err('Internal error: expected type is set as implicit while evaluating value type', value)
  }

  return matchUnion(value.parsed)('type', {
    null: () => {
      if (!expectedType) {
        return err(
          {
            message: 'Cannot determine the type of this value',
            complements: [
              ['Tip', 'Usage of "null" values require to be able to determine the type of the parent expression'],
            ],
          },
          value
        )
      }

      if (!expectedType.nullable) {
        return err(
          {
            message: 'Unexpected usage of "null" value ; type is not nullable',
            complements: [
              ['Expected', rebuildType(expectedType)],
              ['Found', 'void'],
            ],
          },
          value
        )
      }
      return success(expectedType)
    },

    bool: ({ type }) =>
      expectedType && expectedType.inner.type !== value.parsed.type
        ? errIncompatibleValueType(
            {
              expectedType,
              foundType: type,
            },
            value
          )
        : success({ nullable: false, inner: { type } }),

    number: ({ type }) =>
      expectedType && expectedType.inner.type !== value.parsed.type
        ? errIncompatibleValueType(
            {
              expectedType,
              foundType: type,
            },
            value
          )
        : success({ nullable: false, inner: { type } }),

    string: ({ type }) =>
      expectedType && expectedType.inner.type !== value.parsed.type
        ? errIncompatibleValueType(
            {
              expectedType,
              foundType: type,
            },
            value
          )
        : success({ nullable: false, inner: { type } }),

    path: ({ type }) =>
      expectedType && expectedType.inner.type !== value.parsed.type
        ? errIncompatibleValueType(
            {
              expectedType,
              foundType: type,
            },
            value
          )
        : success({ nullable: false, inner: { type } }),

    computedString: ({ segments }) => {
      const foundType: ValueType = { nullable: false, inner: { type: 'string' } }

      for (const segment of segments) {
        switch (segment.parsed.type) {
          case 'literal':
            break

          case 'expr':
            const exprType = resolveExprType(segment.parsed.expr, {
              scopes: ctx.scopes,
              expectedType: foundType,
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
      const foundType: ValueType = { nullable: false, inner: { type: 'path' } }

      for (const segment of segments) {
        switch (segment.parsed.type) {
          case 'separator':
          case 'literal':
            break

          case 'expr':
            const exprType = resolveExprType(segment.parsed.expr, {
              scopes: ctx.scopes,
              expectedType: foundType,
            })

            if (!exprType.ok) return exprType
            break

          default:
            return ensureCoverage(segment.parsed)
        }
      }

      return success(foundType)
    },

    list: ({ items }) => {
      if (items.length === 0) {
        return expectedType ? success(expectedType) : err('Unable to determine the type of this list', value)
      }

      let expectedItemType: ValueType | null = null

      if (expectedType) {
        if (expectedType.inner.type !== 'list') {
          return errIncompatibleValueType({ expectedType, foundType: 'list' }, value)
        }

        expectedItemType = expectedType.inner.itemsType
      }

      let referenceType = resolveExprType(items[0], { scopes: ctx.scopes, expectedType: expectedItemType })
      if (!referenceType.ok) return referenceType

      for (const item of items.slice(1)) {
        const itemType = resolveExprType(item, { scopes: ctx.scopes, expectedType: referenceType.data })
        if (!itemType.ok) return itemType
      }

      return success<ValueType>(
        expectedType ?? { nullable: false, inner: { type: 'list', itemsType: referenceType.data } }
      )
    },

    map: ({ entries }) => {
      if (entries.length === 0) {
        return expectedType ? success(expectedType) : err('Unable to determine the type of this map', value)
      }

      let expectedItemType: ValueType | null = null

      if (expectedType) {
        if (expectedType.inner.type !== 'map') {
          return errIncompatibleValueType({ expectedType, foundType: 'map' }, value)
        }

        expectedItemType = expectedType.inner.itemsType
      }

      let referenceType = resolveExprType(entries[0].value, { scopes: ctx.scopes, expectedType: expectedItemType })
      if (!referenceType.ok) return referenceType

      const keys = new Map([[entries[0].key.parsed, entries[0].key]])

      for (const { key, value } of entries.slice(1)) {
        const duplicate = keys.get(key.parsed)

        if (duplicate) {
          return err(
            {
              message: 'A key with this name was already declared above',
              also: [formattableExtract(duplicate, 'Original declaration occurs here')],
            },
            key
          )
        }

        keys.set(key.parsed, key)

        const itemType = resolveExprType(value, { scopes: ctx.scopes, expectedType: referenceType.data })
        if (!itemType.ok) return itemType
      }

      return success<ValueType>(
        expectedType ?? { nullable: false, inner: { type: 'map', itemsType: referenceType.data } }
      )
    },

    struct: ({ members }) => {
      if (members.length === 0) {
        return expectedType ? success(expectedType) : err('Unable to determine the type of this map', value)
      }

      let expectedMembers: Map<string, ValueType> | null = null

      if (expectedType) {
        if (expectedType.inner.type !== 'struct') {
          return errIncompatibleValueType({ expectedType, foundType: 'struct' }, value)
        }

        expectedMembers = new Map()

        for (const { name, type } of expectedType.inner.members) {
          expectedMembers.set(name, type)
        }
      }

      const memberNames = new Map<string, Token<string>>()
      const outputTypes: StructTypeMember[] = []

      for (const { name, value } of members) {
        const duplicate = memberNames.get(name.parsed)

        if (duplicate) {
          return err(
            {
              message: 'A member with this name was already declared above',
              also: [formattableExtract(duplicate, 'Original declaration occurs here')],
            },
            name
          )
        }

        memberNames.set(name.parsed, name)

        let resolvedType: TypecheckerResult<ValueType>

        if (expectedMembers) {
          const expectedType = expectedMembers.get(name.parsed)

          if (!expectedType) {
            return err(
              {
                message: `Unknown member "${name.parsed}"`,
                complements: [['Expected', rebuildType(expectedType!)]],
              },
              name
            )
          }

          resolvedType = resolveExprType(value, { scopes: ctx.scopes, expectedType })
        } else {
          resolvedType = resolveExprType(value, { scopes: ctx.scopes, expectedType: null })
        }

        if (!resolvedType.ok) return resolvedType
        outputTypes.push({ name: name.parsed, type: resolvedType.data })
      }

      return success<ValueType>(expectedType ?? { nullable: false, inner: { type: 'struct', members: outputTypes } })
    },

    closure: ({ fnType, body }) => {
      throw new Error('// TODO: values => closure')
    },

    fnCall: ({ name, args }) => {
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
        foundType = referencedVar.data.data.type
      } else if (referencedFn.ok) {
        foundType = { nullable: false, inner: { type: 'fn', fnType: referencedFn.data.data } }
      } else {
        return err(`Referenced variable "${varname.parsed}" was not found in this scope`, value)
      }

      if (!expectedType) {
        return success(foundType)
      }

      // TODO: Compare already defined types
      throw new Error('// TODO: reference types comparison')
    },
  })
}

const errIncompatibleValueType = (
  {
    text,
    expectedType,
    foundType,
  }: { text?: string; expectedType: ValueType; foundType: ValueType | ValueType['inner']['type'] },
  value: Token<Value>
) => {
  const expectedNoDepth = rebuildType(expectedType, true)
  const foundNoDepth = typeof foundType === 'string' ? foundType : rebuildType(foundType, true)

  const expected = rebuildType(expectedType)
  const found = typeof foundType === 'string' ? foundType : rebuildType(foundType)

  return err(
    {
      message:
        text ??
        `expected \`${rebuildType(expectedType, true)}\`, found \`${
          typeof foundType === 'string' ? foundType : rebuildType(foundType, true)
        }\``,
      complements:
        expectedNoDepth !== expected || foundNoDepth !== found
          ? [
              ['Expected', rebuildType(expectedType)],
              ['Found   ', typeof foundType === 'string' ? foundType : rebuildType(foundType)],
            ]
          : [],
    },
    value
  )
}

// export const isStringifyableType = ({ nullable, inner: { type: typeType } }: ValueType) =>
//   !nullable && (typeType === 'number' || typeType === 'string')

// export const isTypeConvertibleToPath = ({ nullable, inner: { type: typeType } }: ValueType) =>
//   !nullable && (typeType === 'number' || typeType === 'string' || typeType === 'path')
