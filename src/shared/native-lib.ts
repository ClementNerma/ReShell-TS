import { FnDeclArg, FnType, PrimitiveValueType, ValueType } from './ast'
import { CodeSection, Token } from './parsed'

export const nativeLibraryTypeAliases = ensureValueTypes<ValueType>()({
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

export const nativeLibraryVarTypes = ensureValueTypes<ValueType>()({
  argv: { type: 'list', itemsType: { type: 'string' } },
  PATH: { type: 'list', itemsType: { type: 'string' } },
})

export const nativeLibraryFnTypes = ensureValueTypes<FnType>()({
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

  split: _buildNativeLibraryFn({
    args: () => [
      { name: 'subject', type: 'string' },
      { name: 'delimiter', type: 'string' },
    ],
    returnType: () => ({ type: 'list', itemsType: { type: 'string' } }),
  }),

  join: _buildNativeLibraryFn({
    args: () => [
      { name: 'subject', type: { type: 'list', itemsType: { type: 'string' } } },
      { name: 'glue', type: 'string' },
    ],
    returnType: () => ({ type: 'string' }),
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

  trace: _buildNativeLibraryFn({ args: () => [{ name: 'message', type: 'string', optional: true }] }),

  ls: _buildNativeLibraryFn({
    args: () => [{ name: 'path', type: 'path' }],
    returnType: () => ({ type: 'aliasRef', typeAliasName: _forgeToken('LsItem') }),
  }),
})

// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ Native library builder utilities ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ //

function ensureValueTypes<V>(): <K extends string>(obj: { [key in K]: V }) => { [key in K]: Token<V> } {
  return <K extends string>(obj: { [key in K]: V }) =>
    fromEntries<K, Token<V>>(
      Object.entries<V>(obj).map<[K, Token<V>]>(([name, value]) => [name as K, _forgeToken(value)])
    )
}

function fromEntries<K extends string, P>(entries: [K, P][]): { [key in K]: P } {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-explicit-any
  return Object.fromEntries(entries) as any
}

function _nativeLibAt(): CodeSection {
  return {
    start: { file: { type: 'internal', path: '<native library>' }, col: 0, line: 0 },
    next: { file: { type: 'internal', path: '<native library>' }, col: 0, line: 1 },
  }
}

function _forgeToken<T>(data: T): Token<T> {
  return {
    at: _nativeLibAt(),
    matched: -1,
    parsed: data,
  }
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
  const forgedGenerics = fromEntries(
    (generics ?? []).map<[G, _Generic]>((name) => [
      name,
      { type: 'generic', name: _forgeToken(name), orig: _nativeLibAt() },
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
