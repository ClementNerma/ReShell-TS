import { FnType, ValueType } from './ast'
import { CodeSection, Token } from './parsed'

let nativeLibAtCounter = 0
const nativeLibAtMap: Map<string, CodeSection> = new Map()

export const nativeLibAt = (named?: string): CodeSection => {
  if (named === undefined) {
    nativeLibAtCounter += 1

    return {
      start: { file: { type: 'internal', path: '<native library>' }, col: nativeLibAtCounter, line: 0 },
      next: { file: { type: 'internal', path: '<native library>' }, col: nativeLibAtCounter, line: 1 },
    }
  }

  const existing = nativeLibAtMap.get(named)
  if (existing) return existing

  const section = nativeLibAt()
  nativeLibAtMap.set(named, section)
  return section
}

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

  LsItemType: { type: 'enum', variants: _forgeTokens(['File', 'Dir', 'Symlink', 'Unknown']) },
})

export type NativeLibraryFnNames = 'ok' | 'err' | 'echo' | 'dump' | 'trace' | 'typed' | 'ls'

export function buildWithNativeLibraryFunctionNames<T>(obj: { [name in NativeLibraryFnNames]: T }): Map<string, T> {
  return new Map(Object.entries(obj))
}

export const nativeLibraryFnTypes = buildWithNativeLibraryFunctionNames<FnType>({
  ok: {
    generics: [_forgeToken('T', 'ok:T'), _forgeToken('E', 'ok:E')],
    args: _forgeTokens([
      {
        flag: null,
        name: _forgeToken('value'),
        optional: false,
        defaultValue: null,
        type: _forgeToken({ type: 'generic', name: _forgeToken('T'), orig: nativeLibAt('ok:T') }),
      },
    ]),
    restArg: null,
    returnType: _forgeToken({
      type: 'failable',
      successType: _forgeToken({ type: 'generic', name: _forgeToken('T'), orig: nativeLibAt('ok:T') }),
      failureType: _forgeToken({ type: 'generic', name: _forgeToken('E'), orig: nativeLibAt('ok:E') }),
    }),
  },

  err: {
    generics: [_forgeToken('T', 'err:T'), _forgeToken('E', 'err:E')],
    args: _forgeTokens([
      {
        flag: null,
        name: _forgeToken('error'),
        optional: false,
        defaultValue: null,
        type: _forgeToken({ type: 'generic', name: _forgeToken('E'), orig: nativeLibAt('err:E') }),
      },
    ]),
    restArg: null,
    returnType: _forgeToken({
      type: 'failable',
      successType: _forgeToken({ type: 'generic', name: _forgeToken('T'), orig: nativeLibAt('err:T') }),
      failureType: _forgeToken({ type: 'generic', name: _forgeToken('E'), orig: nativeLibAt('err:E') }),
    }),
  },

  typed: {
    generics: [_forgeToken('T', 'typed:T')],
    args: _forgeTokens([
      {
        flag: null,
        name: _forgeToken('value'),
        optional: false,
        defaultValue: null,
        type: _forgeToken({ type: 'generic', name: _forgeToken('T'), orig: nativeLibAt('typed:T') }),
      },
    ]),
    restArg: null,
    returnType: _forgeToken({ type: 'generic', name: _forgeToken('T'), orig: nativeLibAt('typed:T') }),
  },

  echo: {
    generics: [],
    args: _forgeTokens([
      {
        flag: null,
        name: _forgeToken('message'),
        optional: false,
        defaultValue: null,
        type: _forgeToken({ type: 'string' }),
      },
      {
        flag: _forgeToken('-'),
        name: _forgeToken('n'),
        optional: false,
        defaultValue: null,
        type: _forgeToken({ type: 'bool' }),
      },
    ]),
    restArg: null,
    returnType: null,
  },

  dump: {
    generics: [],
    args: _forgeTokens([
      {
        flag: null,
        name: _forgeToken('value'),
        optional: false,
        defaultValue: null,
        type: _forgeToken({ type: 'unknown' }),
      },
    ]),
    restArg: null,
    returnType: null,
  },

  trace: {
    generics: [],
    args: [],
    restArg: null,
    returnType: null,
  },

  ls: {
    generics: [],
    args: _forgeTokens([
      /*{
        flag: null,
        name: _forgeToken('path'),
        optional: true,
        defaultValue: null,
        type: { type: 'path' },
      },
      {
        flag: _forgeToken('--'),
        name: _forgeToken('hidden'),
        optional: true,
        defaultValue: null,
        type: { type: 'bool' },
      },*/
    ]),
    restArg: null,
    returnType: _forgeToken({
      type: 'list',
      itemsType: { type: 'aliasRef', typeAliasName: _forgeToken('LsItem') },
    }),
  },
})

export type NativeLibraryVarNames = 'argv' | 'PATH'

export function buildWithNativeLibraryVarNames<T>(obj: { [name in NativeLibraryVarNames]: T }): Map<string, T> {
  return new Map(Object.entries(obj))
}

export const nativeLibraryVarTypes = buildWithNativeLibraryVarNames<ValueType>({
  argv: { type: 'list', itemsType: { type: 'string' } },
  PATH: { type: 'list', itemsType: { type: 'string' } },
})

function _forgeToken<T>(data: T, named?: string): Token<T> {
  return { at: nativeLibAt(named), matched: -1, parsed: data }
}

function _forgeTokens<T>(data: T[]): Token<T>[] {
  return data.map((item) => _forgeToken(item))
}
