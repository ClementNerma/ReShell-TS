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
  ok: ({ at }, args) =>
    withArguments(at, args, { value: 'unknown' }, ({ value }) => success({ type: 'failable', success: true, value })),

  err: ({ at }, args) =>
    withArguments(at, args, { error: 'unknown' }, ({ error }) =>
      success({ type: 'failable', success: false, value: error })
    ),

  typed: ({ at }, args) => withArguments(at, args, { value: 'unknown' }, ({ value }) => success(value)),

  toFixed: ({ at }, args) =>
    withArguments(at, args, { number: 'number', precision: 'number' }, ({ number, precision }) =>
      success({
        type: 'string',
        value: number.value.toFixed(precision.value),
      })
    ),

  listAt: ({ at }, args) =>
    withArguments(at, args, { list: 'list', index: 'number' }, ({ list, index }) => {
      const item = list.items.at(index.value)
      return success(item ?? { type: 'null' })
    }),

  repeat: ({ at }, args) =>
    withArguments(at, args, { str: 'string', repeat: 'number' }, ({ str, repeat }) =>
      success({ type: 'string', value: str.value.repeat(repeat.value) })
    ),

  split: ({ at }, args) =>
    withArguments(at, args, { subject: 'string', delimiter: 'string' }, ({ subject, delimiter }) =>
      success({
        type: 'list',
        items: subject.value.split(delimiter.value).map((str) => ({ type: 'string', value: str })),
      })
    ),

  join: ({ at }, args) =>
    withArguments(at, args, { subject: 'list', glue: 'string' }, ({ subject, glue }) => {
      const pieces: string[] = []

      for (const value of subject.items) {
        const str = expectValueType(at, value, 'string')
        if (str.ok !== true) return str
        pieces.push(str.data.value)
      }

      return success({ type: 'string', value: pieces.join(glue.value) })
    }),

  pathtostr: ({ at, ctx }, args) =>
    withArguments(at, args, { path: 'path' }, ({ path }) =>
      success({ type: 'string', value: path.segments.join(ctx.platformPathSeparator) })
    ),

  strtopath: ({ at }, args) =>
    withArguments(at, args, { path: 'string' }, ({ path }) =>
      success({ type: 'path', segments: path.value.split(/[/\\]/) })
    ),

  pathSegments: ({ at }, args) =>
    withArguments(at, args, { path: 'path' }, ({ path }) =>
      success({ type: 'list', items: path.segments.map((segment) => ({ type: 'string', value: segment })) })
    ),

  pathFromSegments: ({ at, ctx }, args) =>
    withArguments(at, args, { segments: 'list' }, ({ segments }) => {
      const pieces: string[] = []

      for (const value of segments.items) {
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
    withArguments(at, args, { paths: 'list' }, ({ paths }) => {
      const pieces: string[] = []

      for (const value of paths.items) {
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
    withArguments(at, args, { path: 'path' }, ({ path }) =>
      success({ type: 'bool', value: isAbsolute(path.segments.join(ctx.platformPathSeparator)) })
    ),

  echo: ({ at, pipeTo }, args) =>
    withArguments(at, args, { message: 'string', n: 'bool' }, ({ message, n }) => {
      pipeTo.stdout.write(n.value ? message.value : message.value + '\n')
      return success(null)
    }),

  dump: ({ at, ctx, pipeTo }, args) =>
    withArguments(at, args, { value: 'unknown', pretty: 'bool' }, ({ value, pretty }) => {
      pipeTo.stdout.write(valueToStr(value, pretty.value, true, ctx) + '\n')
      return success(null)
    }),

  toStr: ({ at, ctx }, args) =>
    withArguments(at, args, { value: 'unknown', pretty: 'bool' }, ({ value, pretty }) =>
      success({
        type: 'string',
        value: valueToStr(value, pretty.value, false, ctx),
      })
    ),

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

function withArguments<A extends { [name: string]: ValueType['type'] | { nullable: ValueType['type'] } }>(
  at: CodeSection,
  map: Map<string, ExecValue>,
  expecting: A,
  callback: (data: {
    [name in keyof A]: Extract<
      ExecValue,
      A[name] extends { nullable: ValueType['type'] }
        ? { type: 'null' } | { type: A[name]['nullable'] }
        : { type: A[name] }
    >
  }) => RunnerResult<ExecValue | null>
): RunnerResult<ExecValue> {
  const out: object = {}

  for (const [name, type] of Object.entries(expecting)) {
    const value = map.get(name)

    let expectedType: ValueType['type']

    if (value === undefined)
      return err(at, `internal error in native library executor: argument "${name}" was not found`)

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
        `internal error in native library executor: expected argument "${name}" to be of type "${expectedType}", found ${value.type}`
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
      'internal error in native library executor: unknown arguments provided: ' + [...map.keys()].join(', ')
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
