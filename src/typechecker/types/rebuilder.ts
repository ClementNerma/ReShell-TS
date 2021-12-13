import { LiteralValue, ValueType } from '../../shared/ast'
import { matchUnion } from '../../shared/utils'

export function rebuildType(type: ValueType, noDepth?: boolean): string {
  return matchUnion(type, 'type', {
    bool: () => 'bool',
    number: () => 'number',
    string: () => 'string',
    path: () => 'path',
    list: ({ itemsType }) => (noDepth ? 'list' : `[${rebuildType(itemsType)}]`),
    map: ({ itemsType }) => (noDepth ? 'map' : `map[${rebuildType(itemsType)}]`),
    struct: ({ members }) =>
      noDepth ? 'struct' : `struct { ${members.map(({ name, type }) => `${name}: ${rebuildType(type)}`).join(', ')} }`,
    fn: ({ fnType: { args, returnType, failureType } }) =>
      noDepth
        ? 'fn'
        : `fn(${args
            .map(
              ({ parsed: { flag, name, optional, type, defaultValue } }) =>
                `${flag?.parsed ?? ''}${name.parsed}${optional ? '?' : ''}: ${rebuildType(type)}${
                  defaultValue ? ' = ' + rebuildLiteralValue(defaultValue) : ''
                }`
            )
            .join(', ')})${
            returnType || failureType
              ? ` -> ${returnType ? rebuildType(returnType.parsed) : 'void'}${
                  failureType ? ' throws ' + rebuildType(failureType.parsed) : ''
                }`
              : ''
          }`,
    aliasRef: ({ typeAliasName }) => '@' + typeAliasName.parsed,
    nullable: ({ inner }) => '?' + rebuildType(inner, noDepth),
    unknown: () => 'unknown',

    // Internal types
    void: () => 'void',
  })
}

export const rebuildLiteralValue = (value: LiteralValue): string =>
  matchUnion(value, 'type', {
    null: () => 'null',
    bool: ({ value }) => (value.parsed ? 'true' : 'false'),
    number: ({ value }) => value.parsed.toString(),
    string: ({ value }) => `'${value.parsed}'`,
    path: ({ segments }) => segments.parsed.map((segment) => segment.parsed).join('/'),
  })
