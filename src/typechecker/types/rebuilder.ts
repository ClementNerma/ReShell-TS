import { matchUnion } from '../../parsers/utils'
import { LiteralValue, ValueType } from '../../shared/parsed'

export const rebuildType = (type: ValueType, noDepth?: boolean): string => {
  return (
    (type.nullable ? '?' : '') +
    matchUnion(type.inner)('type', {
      void: () => 'void',
      bool: () => 'bool',
      number: () => 'number',
      string: () => 'string',
      path: () => 'path',
      list: ({ itemsType }) => (noDepth ? 'list' : `list[${rebuildType(itemsType)}]`),
      map: ({ itemsType }) => (noDepth ? 'map' : `map[${rebuildType(itemsType)}]`),
      struct: ({ members }) =>
        noDepth ? 'struct' : `struct { ${members.map(({ name, type }) => `${name}: ${rebuildType(type)}`)} }`,
      fn: ({ fnType: { named, args, returnType, failureType } }) =>
        noDepth
          ? 'fn'
          : `fn${named ? ' ' + named.parsed + ' ' : ''}(${args.map(
              ({ name, optional, type, defaultValue }) =>
                `${name}${optional ? '?' : ''}: ${rebuildType(type)}${
                  defaultValue ? ' = ' + rebuildLiteralValue(defaultValue) : ''
                }${
                  returnType || failureType
                    ? ` -> ${returnType ? rebuildType(returnType) : 'void'}${
                        failureType ? ' throws ' + rebuildType(failureType) : ''
                      }`
                    : ''
                }`
            )})`,
      aliasRef: ({ typeAliasName }) => '@' + typeAliasName.parsed,
      unknown: () => 'unknown',

      // Internal types
      implicit: () => '<implicit>',
    })
  )
}

export const rebuildLiteralValue = (value: LiteralValue): string =>
  matchUnion(value)('type', {
    null: () => 'null',
    bool: ({ value }) => (value.parsed ? 'true' : 'false'),
    number: ({ value }) => value.parsed.toString(),
    string: ({ value }) => `'${value.parsed}'`,
    path: ({ segments }) => segments.parsed.map((segment) => segment.parsed).join('/'),
  })
