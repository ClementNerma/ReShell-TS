import { lstatSync, readdirSync } from 'fs'
import { isAbsolute, join } from 'path'
import { ValueType } from '../shared/ast'
import { nativeLibraryFnTypes, nativeLibraryVarTypes } from '../shared/native-lib'
import { CodeSection } from '../shared/parsed'
import { matchUnion } from '../shared/utils'
import { err, ExecValue, RunnerContext, RunnerResult, success } from './base'

export const nativeLibraryVariables = makeMap<typeof nativeLibraryVarTypes, (ctx: RunnerContext) => ExecValue>({
  argv: (ctx) => ({
    type: 'list',
    items: ctx.argv.map((value) => ({ type: 'string', value })),
  }),
  PATH: () => ({
    type: 'list',
    items:
      process.env['PATH'] !== undefined
        ? process.env['PATH'].split(':').map((entry) => ({ type: 'string', value: entry }))
        : [],
  }),
})

export type NativeFn = (
  input: {
    ctx: Exclude<RunnerContext, 'pipeTo'>
    at: CodeSection
    pipeTo: NonNullable<RunnerContext['pipeTo']>
  },
  args: Map<string, ExecValue>
) => RunnerResult<ExecValue | null>

export const nativeLibraryFunctions = makeMap<typeof nativeLibraryFnTypes, NativeFn>({
  // Numbers
  toFixed: ({ at }, args) =>
    withArguments(at, args, { self: 'number', precision: 'number' }, ({ self, precision }) =>
      success({
        type: 'string',
        value: self.value.toFixed(precision.value),
      })
    ),

  // Strings
  len: ({ at }, args) =>
    withArguments(at, args, { self: 'string' }, ({ self }) => success({ type: 'number', value: self.value.length })),

  includes: ({ at }, args) =>
    withArguments(at, args, { self: 'string', lookup: 'string' }, ({ self, lookup }) =>
      success({ type: 'bool', value: self.value.includes(lookup.value) })
    ),

  charAt: ({ at }, args) =>
    withArguments(at, args, { self: 'string', index: 'number' }, ({ self, index }) =>
      success(
        Math.floor(index.value) === index.value && index.value >= 0 && index.value < self.value.length
          ? { type: 'string', value: self.value.charAt(index.value) }
          : { type: 'null' }
      )
    ),

  indexOf: ({ at }, args) =>
    withArguments(at, args, { self: 'string', lookup: 'string' }, ({ self, lookup }) =>
      success(
        self.value.includes(lookup.value)
          ? { type: 'number', value: self.value.indexOf(lookup.value) }
          : { type: 'null' }
      )
    ),

  replace: ({ at }, args) =>
    withArguments(
      at,
      args,
      { self: 'string', model: 'string', replacement: 'string' },
      ({ self, model, replacement }) =>
        success({
          type: 'string',
          value: self.value.replaceAll(model.value, replacement.value),
        })
    ),

  repeat: ({ at }, args) =>
    withArguments(at, args, { self: 'string', repeat: 'number' }, ({ self, repeat }) =>
      success({ type: 'string', value: self.value.repeat(repeat.value) })
    ),

  split: ({ at }, args) =>
    withArguments(at, args, { self: 'string', delimiter: 'string' }, ({ self, delimiter }) =>
      success({
        type: 'list',
        items: self.value.split(delimiter.value).map((str) => ({ type: 'string', value: str })),
      })
    ),

  // Paths
  tostr: ({ at, ctx }, args) =>
    withArguments(at, args, { self: 'path' }, ({ self }) =>
      success({ type: 'string', value: self.segments.join(ctx.platformPathSeparator) })
    ),

  toPath: ({ at }, args) =>
    withArguments(at, args, { self: 'string' }, ({ self }) =>
      success({ type: 'path', segments: self.value.split(/[/\\]/) })
    ),

  segments: ({ at }, args) =>
    withArguments(at, args, { self: 'path' }, ({ self }) =>
      success({ type: 'list', items: self.segments.map((segment) => ({ type: 'string', value: segment })) })
    ),

  composePath: ({ at, ctx }, args) =>
    withArguments(at, args, { self: 'list' }, ({ self }) => {
      const pieces: string[] = []

      for (const value of self.items) {
        const str = expectValueType(at, value, 'string')
        if (str.ok !== true) return str
        pieces.push(str.data.value)
      }

      return success({
        type: 'path',
        segments: pieces.join(ctx.platformPathSeparator).split(ctx.platformPathSeparator),
      })
    }),

  joinPaths: ({ at, ctx }, args) =>
    withArguments(at, args, { self: 'list' }, ({ self }) => {
      const pieces: string[] = []

      for (const value of self.items) {
        const path = expectValueType(at, value, 'path')
        if (path.ok !== true) return path
        pieces.push(path.data.segments.join(ctx.platformPathSeparator))
      }

      return success({
        type: 'path',
        segments: join(...pieces).split(ctx.platformPathSeparator),
      })
    }),

  isAbsolute: ({ at, ctx }, args) =>
    withArguments(at, args, { self: 'path' }, ({ self }) =>
      success({ type: 'bool', value: isAbsolute(self.segments.join(ctx.platformPathSeparator)) })
    ),

  // Lists
  at: ({ at }, args) =>
    withArguments(at, args, { self: 'list', index: 'number' }, ({ self, index }) => {
      const item = self.items.at(index.value)
      return success(item ?? { type: 'null' })
    }),

  join: ({ at }, args) =>
    withArguments(at, args, { self: 'list', glue: 'string' }, ({ self, glue }) => {
      const pieces: string[] = []

      for (const value of self.items) {
        const str = expectValueType(at, value, 'string')
        if (str.ok !== true) return str
        pieces.push(str.data.value)
      }

      return success({ type: 'string', value: pieces.join(glue.value) })
    }),

  // Failables
  ok: ({ at }, args) =>
    withArguments(at, args, { value: 'unknown' }, ({ value }) => success({ type: 'failable', success: true, value })),

  err: ({ at }, args) =>
    withArguments(at, args, { error: 'unknown' }, ({ error }) =>
      success({ type: 'failable', success: false, value: error })
    ),

  // Nullables
  unwrap: ({ at }, args) =>
    withArguments(at, args, { self: 'unknown' }, ({ self }) =>
      self.type !== 'null' ? success(self) : err(at, 'tried to unwrap a "null" value')
    ),

  expect: ({ at }, args) =>
    withArguments(at, args, { self: 'unknown', message: 'string' }, ({ self, message }) =>
      self.type !== 'null' ? success(self) : err(at, message.value)
    ),

  // Type utilities
  typed: ({ at }, args) => withArguments(at, args, { value: 'unknown' }, ({ value }) => success(value)),

  // Debug utilities
  debugStr: ({ at, ctx }, args) =>
    withArguments(at, args, { self: 'unknown', pretty: 'bool' }, ({ self, pretty }) =>
      success({
        type: 'string',
        value: valueToStr(self, pretty.value, false, ctx),
      })
    ),

  dump: ({ at, ctx, pipeTo }, args) =>
    withArguments(at, args, { value: 'unknown', pretty: 'bool' }, ({ value, pretty }) => {
      pipeTo.stdout.write(valueToStr(value, pretty.value, true, ctx) + '\n')
      return success(null)
    }),

  trace: ({ pipeTo, at }, args) =>
    withArguments(at, args, { message: { nullable: 'string' } }, ({ message }) => {
      const file: string = matchUnion(at.start.file, 'type', {
        entrypoint: ({ path }) => path,
        file: ({ path }) => path,
        internal: ({ path }) => `<internal:${path}>`,
      })

      let display = `[Trace] ${file}:${at.start.line + 1}:${at.start.col + 1}`

      if (message.type !== 'null') {
        display += ' | ' + message.value
      }

      pipeTo.stdout.write(`${display}\n`)

      return success(null)
    }),

  // Terminal utilities
  echo: ({ at, pipeTo }, args) =>
    withArguments(at, args, { message: 'string', n: 'bool' }, ({ message, n }) => {
      pipeTo.stdout.write(n.value ? message.value : message.value + '\n')
      return success(null)
    }),

  // Filesystem utilities
  ls: ({ at, ctx }, args) =>
    withArguments(at, args, { path: { nullable: 'path' } }, ({ path }) => {
      const dir = path.type === 'null' ? process.cwd() : path.segments.join(ctx.platformPathSeparator)

      return success({
        type: 'list',
        items: readdirSync(dir).map((name): ExecValue => {
          const item = lstatSync(join(dir, name))

          return {
            type: 'struct',
            members: new Map<string, ExecValue>([
              [
                'type',
                item.isFile()
                  ? { type: 'enum', variant: 'File' }
                  : item.isDirectory()
                  ? { type: 'enum', variant: 'Dir' }
                  : item.isSymbolicLink()
                  ? { type: 'enum', variant: 'Symlink' }
                  : { type: 'enum', variant: 'Unknown' },
              ],
              ['name', { type: 'string', value: name }],
              [
                'size',
                item.isFile() || item.isSymbolicLink() ? { type: 'number', value: item.size } : { type: 'null' },
              ],
              ['ctime', { type: 'number', value: item.ctime.getDate() }],
              ['mtime', { type: 'number', value: item.mtime.getDate() }],
              ['atime', { type: 'number', value: item.atime.getDate() }],
            ]),
          }
        }),
      })
    }),
})

const valueToStr = (value: ExecValue, pretty: boolean, dumping: boolean, ctx: RunnerContext): string =>
  matchUnion(value, 'type', {
    null: () => 'null',
    bool: ({ value }) => (value ? 'true' : 'false'),
    number: ({ value }) => value.toString(),
    string: ({ value }) => (dumping ? `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"` : value),
    path: ({ segments }) => segments.join(ctx.platformPathSeparator),
    list: ({ items }) =>
      `[${pretty ? '\n' : ''}${items
        .map((item) =>
          pretty
            ? valueToStr(item, pretty, dumping, ctx)
                .split('\n')
                .map((line) => '  ' + line)
                .join('\n')
            : valueToStr(item, pretty, dumping, ctx)
        )
        .join(',' + (pretty ? '\n' : ' '))}${pretty ? '\n' : ''}]`,
    map: ({ entries }) =>
      `map:(${pretty ? '\n' : ''}${[...entries]
        .map(([entry, value]) => {
          const text = `"${entry.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}": ${valueToStr(
            value,
            pretty,
            dumping,
            ctx
          )}`
          return pretty
            ? text
                .split('\n')
                .map((line) => '  ' + line)
                .join('\n')
            : text
        })
        .join(',' + (pretty ? '\n' : ' '))}${pretty ? '\n' : ''})`,
    struct: ({ members }) =>
      `{${pretty ? '\n' : ''}${[...members.entries()]
        .map(([member, value]) => {
          const text = `${member}: ${valueToStr(value, pretty, dumping, ctx)}`
          return pretty
            ? text
                .split('\n')
                .map((line) => '  ' + line)
                .join('\n')
            : text
        })
        .join(',' + (pretty ? '\n' : ' '))}${pretty ? '\n' : ''}}`,
    enum: ({ variant }) => `enum::.${variant}`,
    fn: () => `<declared function>`,
    callback: () => `<callback>`,
    failable: ({ success, value }) => `${success ? 'ok' : 'err'}(${valueToStr(value, pretty, dumping, ctx)})`,
    rest: () => `<rest>`,
  })

// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ Native library runtime utilities ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ //

function makeMap<R extends object, O>(values: { [key in keyof R]: O }): Map<string, O> {
  return new Map(Object.entries(values))
}

function withArguments<
  A extends { [name: string]: ValueType['type'] | 'unknown' | { nullable: ValueType['type'] | 'unknown' } }
>(
  at: CodeSection,
  map: Map<string, ExecValue>,
  expecting: A,
  callback: (data: {
    [name in keyof A]: Extract<
      ExecValue,
      A[name] extends { nullable: ValueType['type'] | 'unknown' }
        ? A[name]['nullable'] extends 'unknown'
          ? ExecValue
          : { type: 'null' } | { type: A[name]['nullable'] }
        : A[name] extends 'unknown'
        ? ExecValue
        : { type: A[name] }
    >
  }) => RunnerResult<ExecValue | null>
): RunnerResult<ExecValue> {
  const out: object = {}

  for (const [name, type] of Object.entries(expecting)) {
    const value = map.get(name)

    let expectedType: ValueType['type']

    if (value === undefined)
      return err(at, `internal error: native library assertion failed: argument \`${name}\` was not found`)

    if (typeof type === 'string') {
      expectedType = type
    } else {
      if (value.type === 'null') {
        continue
      }

      expectedType = type.nullable
    }

    if (value.type !== expectedType && expectedType !== 'unknown') {
      return err(
        at,
        `internal error: native library assertion failed: expected argument \`${name}\` to be of type "${expectedType}", found ${value.type}`
      )
    }

    map.delete(name)

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    out[name] = value
  }

  if (map.size > 0) {
    return err(
      at,
      'internal error: native library assertion failed: unknown arguments provided: ' + [...map.keys()].join(', ')
    )
  }

  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  return callback(out)
}

export function expectValueType<T extends ExecValue['type']>(
  at: CodeSection,
  value: ExecValue,
  type: T
): RunnerResult<Extract<ExecValue, { type: T }>> {
  return value.type === type
    ? success(value as Extract<ExecValue, { type: T }>)
    : err(
        at,
        `internal error in native library executor: type mismatch (expected internal type "${type}", found "${value.type}")`
      )
}
