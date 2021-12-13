import { FnDeclArg, FnType, PrimitiveValueType, ValueType } from './ast'
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
      { name: 'ctime', type: { type: 'number' } },
      { name: 'mtime', type: { type: 'number' } },
      { name: 'atime', type: { type: 'number' } },
    ],
  },

  LsItemType: { type: 'enum', variants: _forgeTokens(['File', 'Dir', 'Symlink', 'Unknown']) },
})

export type NativeLibraryFnNames =
  | 'ok'
  | 'err'
  | 'typed'
  | 'toFixed'
  | 'listAt'
  | 'repeat'
  | 'echo'
  | 'dump'
  | 'toStr'
  | 'trace'
  | 'ls'

export function buildWithNativeLibraryFunctionNames<T>(obj: { [name in NativeLibraryFnNames]: T }): Map<string, T> {
  return new Map(Object.entries(obj))
}

export const nativeLibraryFnTypes = buildWithNativeLibraryFunctionNames<FnType>({
  ok: _buildNativeLibraryFn({
    generics: ['T', 'E'],
    args: ({ T }) => [{ name: 'value', type: T }],
    returnType: ({ T, E }) => ({ type: 'failable', successType: _forgeToken(T), failureType: _forgeToken(E) }),
  }),

  err: _buildNativeLibraryFn({
    generics: ['T', 'E'],
    args: ({ E }) => [{ name: 'error', type: E }],
    returnType: ({ T, E }) => ({ type: 'failable', successType: _forgeToken(T), failureType: _forgeToken(E) }),
  }),

  typed: _buildNativeLibraryFn({
    generics: ['T'],
    args: ({ T }) => [{ name: 'value', type: T }],
    returnType: ({ T }) => T,
  }),

  toFixed: _buildNativeLibraryFn({
    args: () => [
      { name: 'number', type: 'number' },
      { name: 'precision', type: 'number' },
    ],
    returnType: () => 'string',
  }),

  listAt: _buildNativeLibraryFn({
    generics: ['T'],
    args: ({ T }) => [
      { name: 'list', type: { type: 'list', itemsType: T } },
      { name: 'index', type: 'number' },
    ],
    returnType: ({ T }) => ({ type: 'nullable', inner: T }),
  }),

  repeat: _buildNativeLibraryFn({
    args: () => [
      { name: 'str', type: 'string' },
      { name: 'repeat', type: 'number' },
    ],
    returnType: () => 'string',
  }),

  echo: _buildNativeLibraryFn({
    args: () => [
      { name: 'message', type: 'string' },
      { flag: '-', name: 'n', type: 'bool' },
    ],
  }),

  dump: _buildNativeLibraryFn({
    args: () => [
      { name: 'value', type: 'unknown' },
      { flag: '--', name: 'pretty', type: 'bool' },
    ],
  }),

  toStr: _buildNativeLibraryFn({
    args: () => [
      { name: 'value', type: 'unknown' },
      { flag: '--', name: 'pretty', type: 'bool' },
    ],
    returnType: () => 'string',
  }),

  trace: _buildNativeLibraryFn({ args: () => [] }),

  ls: _buildNativeLibraryFn({
    args: () => [{ name: 'path', type: 'path' }],
    returnType: () => ({ type: 'aliasRef', typeAliasName: _forgeToken('LsItem') }),
  }),
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

type _Generic = Extract<ValueType, { type: 'generic' }>

function _buildNativeLibraryFn<G extends string>({
  generics,
  args,
  restArg,
  returnType,
}: {
  generics?: G[]
  args: (forgedGenerics: { [name in G]: _Generic }) => {
    flag?: '-' | '--'
    name: string
    optional?: true
    type: ValueType | PrimitiveValueType['type'] | 'unknown'
  }[]
  restArg?: string
  returnType?: (forgedGenerics: { [name in G]: _Generic }) => ValueType | PrimitiveValueType['type'] | 'unknown'
}): FnType {
  const fromEntries = <K extends string, P>(entries: [K, P][]): { [key in K]: P } =>
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-explicit-any
    Object.fromEntries(entries) as any

  const forgedGenerics = fromEntries(
    (generics ?? []).map<[G, _Generic]>((name) => [
      name,
      { type: 'generic', name: _forgeToken(name), orig: nativeLibAt() },
    ])
  )

  const ret = returnType?.(forgedGenerics)

  return {
    generics: Object.values<_Generic>(forgedGenerics).map((g) => g.name),
    args: args(forgedGenerics).map(
      ({ flag, name, type, optional }): Token<FnDeclArg> =>
        _forgeToken({
          flag: flag ? _forgeToken(flag) : null,
          name: _forgeToken(name),
          defaultValue: null,
          optional: optional ?? false,
          type: _forgeToken(typeof type === 'string' ? { type } : type),
        })
    ),
    restArg: restArg !== undefined ? _forgeToken(restArg) : null,
    returnType: ret !== undefined ? _forgeToken(typeof ret === 'string' ? { type: ret } : ret) : null,
  }
}
