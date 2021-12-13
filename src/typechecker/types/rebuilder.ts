import { LiteralValue, ValueType } from '../../shared/ast'
import { matchUnion } from '../../shared/utils'

export function rebuildType(type: ValueType, noDepth?: boolean): string {
  return matchUnion(type, 'type', {
    bool: () => 'bool',
    number: () => 'number',
    string: () => 'string',
    path: () => 'path',
    list: ({ itemsType }) => (noDepth === true ? 'list' : `[${rebuildType(itemsType)}]`),
    map: ({ itemsType }) => (noDepth === true ? 'map' : `map[${rebuildType(itemsType)}]`),
    struct: ({ members }) =>
      noDepth === true
        ? 'struct'
        : `{ ${members.map(({ name, type }) => `${name}: ${rebuildType(type)}`).join(', ')} }`,
    enum: ({ variants }) =>
      noDepth === true ? 'enum' : `enum { ${variants.map((variant) => variant.parsed).join(', ')} }`,
    fn: ({ fnType: { args, returnType } }) =>
      noDepth === true
        ? 'fn'
        : `fn(${args
            .map(
              ({ parsed: { flag, name, optional, type, defaultValue } }) =>
                `${flag?.parsed ?? ''}${name.parsed}${optional ? '?' : ''}: ${rebuildType(type)}${
                  defaultValue ? ' = ' + rebuildLiteralValue(defaultValue) : ''
                }`
            )
            .join(', ')})${returnType ? ` -> ${rebuildType(returnType.parsed)}` : ''}`,
    aliasRef: ({ typeAliasName }) => typeAliasName.parsed,
    nullable: ({ inner }) => '?' + rebuildType(inner, noDepth),
    failable: ({ successType, failureType }) =>
      noDepth === true
        ? 'failable'
        : `failable<${rebuildType(successType.parsed)}, ${rebuildType(failureType.parsed)}>`,
    unknown: () => 'unknown',
    generic: ({ name }) => `:${name.parsed}`,

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
