import { LiteralValue, ValueType } from '../../shared/ast'
import { matchUnion } from '../../shared/utils'

export function rebuildType(type: ValueType, options?: { noDepth?: boolean }): string {
  function _subroutine(type: ValueType): string {
    return matchUnion(type, 'type', {
      bool: () => 'bool',
      number: () => 'number',
      string: () => 'string',
      path: () => 'path',
      list: ({ itemsType }) => (noDepth === true ? 'list' : `[${_subroutine(itemsType)}]`),
      map: ({ itemsType }) => (noDepth === true ? 'map' : `map[${_subroutine(itemsType)}]`),
      struct: ({ members }) =>
        noDepth === true
          ? 'struct'
          : `{ ${members.map(({ name, type }) => `${name}: ${_subroutine(type)}`).join(', ')} }`,
      enum: ({ variants }) =>
        noDepth === true ? 'enum' : `enum { ${variants.map((variant) => variant.parsed).join(', ')} }`,
      fn: ({ fnType: { args, generics, restArg, returnType } }) =>
        noDepth === true
          ? 'fn'
          : `fn${generics.length === 0 ? '' : `<${generics.map((g) => ':' + g.parsed).join(', ')}>`}(${args
              .map(
                ({ parsed: { flag, name, optional, type, defaultValue } }) =>
                  `${flag?.parsed ?? ''}${name.parsed}${optional ? '?' : ''}: ${_subroutine(type.parsed)}${
                    defaultValue ? ' = ' + rebuildLiteralValue(defaultValue.parsed) : ''
                  }`
              )
              .join(', ')}${restArg === null ? '' : '...' + restArg.parsed})${
              returnType ? ` -> ${_subroutine(returnType.parsed)}` : ''
            }`,
      aliasRef: ({ typeAliasName }) => typeAliasName.parsed,
      nullable: ({ inner }) => '?' + _subroutine(inner),
      failable: ({ successType, failureType }) =>
        noDepth === true
          ? 'failable'
          : `failable<${_subroutine(successType.parsed)}, ${_subroutine(failureType.parsed)}>`,
      unknown: () => 'unknown',
      generic: ({ name }) => `:${name.parsed}`,

      // Internal types
      void: () => 'void',
    })
  }

  const { noDepth } = options ?? {}

  return _subroutine(type)
}

export const rebuildLiteralValue = (value: LiteralValue): string =>
  matchUnion(value, 'type', {
    null: () => 'null',
    bool: ({ value }) => (value.parsed ? 'true' : 'false'),
    number: ({ value }) => value.parsed.toString(),
    string: ({ value }) => `'${value.parsed}'`,
    path: ({ segments }) => segments.parsed.map((segment) => segment.parsed).join('/'),
  })
