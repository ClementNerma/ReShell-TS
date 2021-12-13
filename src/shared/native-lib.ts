import { FnType, ValueType } from './ast'
import { CodeSection, Token } from './parsed'

export type NativeLibraryTypeAliasNames = 'LsItem' | 'LsItemType'

export function buildWithNativeLibraryTypeAliasNames<T>(obj: { [name in NativeLibraryTypeAliasNames]: T }): Map<
  string,
  T
> {
  return new Map(Object.entries(obj))
}

export const nativeLibraryTypeAliases = buildWithNativeLibraryTypeAliasNames<ValueType>({
  LsItem: {
    type: 'struct',
    members: [
      { name: 'type', type: { type: 'aliasRef', typeAliasName: _forgeToken('LsItemType') } },
      { name: 'name', type: { type: 'string' } },
      { name: 'size', type: { type: 'nullable', inner: { type: 'number' } } },
      { name: 'creationDate', type: { type: 'number' } },
      { name: 'modificationDate', type: { type: 'number' } },
    ],
  },

  LsItemType: { type: 'enum', variants: _forgeTokens(['File', 'Dir', 'Symlink']) },
})

export type NativeLibraryFnNames = 'echo'

export function buildWithNativeLibraryFunctionNames<T>(obj: { [name in NativeLibraryFnNames]: T }): Map<string, T> {
  return new Map(Object.entries(obj))
}

export const nativeLibraryFnTypes = buildWithNativeLibraryFunctionNames<FnType>({
  echo: {
    generics: [],
    args: _forgeTokens([
      {
        flag: null,
        name: _forgeToken('message'),
        optional: false,
        defaultValue: null,
        type: { type: 'string' },
      },
    ]),
    restArg: null,
    returnType: null,
  },
})

export type NativeLibraryVarNames = 'argv' | 'PATH'

export function buildWithNativeLibraryVarNames<T>(obj: { [name in NativeLibraryVarNames]: T }): Map<string, T> {
  return new Map(Object.entries(obj))
}

export const nativeLibraryVarTypes = buildWithNativeLibraryVarNames<ValueType>({
  argv: { type: 'list', itemsType: { type: 'unknown' } },
  PATH: { type: 'list', itemsType: { type: 'string' } },
})

export const nativeLibAt: CodeSection = {
  start: { file: { type: 'internal', path: '<native library>' }, col: 0, line: 0 },
  next: { file: { type: 'internal', path: '<native library>' }, col: 0, line: 0 },
}

function _forgeToken<T>(data: T): Token<T> {
  return { at: nativeLibAt, matched: -1, parsed: data }
}

function _forgeTokens<T>(data: T[]): Token<T>[] {
  return data.map((item) => _forgeToken(item))
}
