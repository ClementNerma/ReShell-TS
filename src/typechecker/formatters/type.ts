import { LiteralValue, ValueType } from '../../parsers/data'
import { matchUnion } from '../../parsers/utils'

export const rebuildType = (type: ValueType): string => {
  return (
    (type.nullable ? '?' : '') +
    matchUnion(type.inner)('type', {
      void: () => 'void',
      bool: () => 'bool',
      number: () => 'number',
      string: () => 'string',
      path: () => 'path',
      list: ({ itemsType }) => `list[${rebuildType(itemsType.parsed)}]`,
      map: ({ itemsType }) => `map[${rebuildType(itemsType.parsed)}]`,
      struct: ({ members }) =>
        `struct { ${members.parsed.map(({ name, type }) => `${name}: ${rebuildType(type.parsed)}`)} }`,
      fn: ({ fnType: { named, args, returnType, failureType } }) =>
        `fn${named ? ' ' + named.parsed + ' ' : ''}(${args.map(
          ({ parsed: { name, optional, type, defaultValue } }) =>
            `${name.parsed}${optional.parsed ? '?' : ''}: ${rebuildType(type.parsed)}${
              defaultValue ? ' = ' + rebuildLiteralValue(defaultValue.parsed) : ''
            }${
              returnType || failureType
                ? ` -> ${returnType ? rebuildType(returnType.parsed) : 'void'}${
                    failureType ? ' throws ' + rebuildType(failureType.parsed) : ''
                  }`
                : ''
            }`
        )})`,
      aliasRef: ({ typeAliasName }) => '@' + typeAliasName,
      unknown: () => 'unknown',
    })
  )
}

export const rebuildLiteralValue = (value: LiteralValue): string =>
  matchUnion(value)('type', {
    null: () => 'null',
    bool: ({ value }) => (value.parsed ? 'true' : 'false'),
    number: ({ value }) => value.parsed.toString(),
    string: ({ value }) => `r"${value.parsed}"`,
    path: ({ segments }) => segments.parsed.map((segment) => segment.parsed).join('/'),
  })
