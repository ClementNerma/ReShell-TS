import { lstatSync, readdirSync } from 'fs'
import { join } from 'path'
import { ValueType } from '../shared/ast'
import { buildWithNativeLibraryFunctionNames, buildWithNativeLibraryVarNames } from '../shared/native-lib'
import { CodeSection } from '../shared/parsed'
import { matchUnion } from '../shared/utils'
import { err, ExecValue, RunnerContext, RunnerResult, success } from './base'

function getArguments<A extends { [name: string]: ValueType['type'] }, H extends keyof A | false = false>(
  at: CodeSection,
  map: Map<string, ExecValue>,
  expecting: A,
  hidden?: Array<H>
): RunnerResult<{
  [name in keyof A]: Extract<
    ExecValue,
    H extends false ? { type: A[name] } : H extends name ? { type: A[name] } | { type: 'null' } : { type: A[name] }
  >
}> {
  const out: object = {}

  for (const [name, type] of Object.entries(expecting)) {
    const value = map.get(name)

    if (value === undefined)
      return err(at, `internal error in native library executor: argument "${name}" was not found`)

    if (value.type !== type && type !== 'unknown' && !(value.type === 'null' && hidden?.includes(name as H) === true)) {
      return err(
        at,
        `internal error in native library executor: expected argument "${name}" to be of type "${type}", found ${value.type}`
      )
    }

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    out[name] = value
  }

  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  return success(out)
}

export const nativeLibraryVariables = buildWithNativeLibraryVarNames<(ctx: RunnerContext) => ExecValue>({
  argv: () => ({ type: 'list', items: process.argv.slice(2).map((value) => ({ type: 'string', value })) }),
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
) => RunnerResult<ExecValue>

export const nativeLibraryFunctions = buildWithNativeLibraryFunctionNames<NativeFn>({
  ok: ({ at }, map) => {
    const args = getArguments(at, map, { value: 'unknown' })
    if (args.ok !== true) return args

    const { value } = args.data
    return { ok: null, breaking: 'return', value: { type: 'failable', success: true, value } }
  },

  err: ({ at }, map) => {
    const args = getArguments(at, map, { error: 'unknown' })
    if (args.ok !== true) return args

    const { error } = args.data
    return { ok: null, breaking: 'return', value: { type: 'failable', success: false, value: error } }
  },

  typed: ({ at }, map) => {
    const args = getArguments(at, map, { value: 'unknown' })
    if (args.ok !== true) return args

    const { value } = args.data
    return { ok: null, breaking: 'return', value }
  },

  toFixed: ({ at }, map) => {
    const args = getArguments(at, map, { number: 'number', precision: 'number' })
    if (args.ok !== true) return args

    const { number, precision } = args.data
    return { ok: null, breaking: 'return', value: { type: 'string', value: number.value.toFixed(precision.value) } }
  },

  listAt: ({ at }, map) => {
    const args = getArguments(at, map, { list: 'list', index: 'number' })
    if (args.ok !== true) return args

    const { list, index } = args.data

    const item = list.items.at(index.value)
    return { ok: null, breaking: 'return', value: item ?? { type: 'null' } }
  },

  repeat: ({ at }, map) => {
    const args = getArguments(at, map, { str: 'string', repeat: 'number' })
    if (args.ok !== true) return args

    const { str, repeat } = args.data

    return { ok: null, breaking: 'return', value: { type: 'string', value: str.value.repeat(repeat.value) } }
  },

  echo: ({ at, pipeTo }, map) => {
    const args = getArguments(at, map, { message: 'string', n: 'bool' })
    if (args.ok !== true) return args

    const { message, n } = args.data
    pipeTo.stdout.write(n.value ? message.value : message.value + '\n')

    return { ok: null, breaking: 'return', value: null }
  },

  dump: ({ at, ctx, pipeTo }, map) => {
    const args = getArguments(at, map, { value: 'unknown', pretty: 'bool' })
    if (args.ok !== true) return args

    const { value, pretty } = args.data
    pipeTo.stdout.write(valueToStr(value, pretty.value, true, ctx) + '\n')

    return { ok: null, breaking: 'return', value: null }
  },

  toStr: ({ at, ctx }, map) => {
    const args = getArguments(at, map, { value: 'unknown', pretty: 'bool' })
    if (args.ok !== true) return args

    const { value, pretty } = args.data

    return {
      ok: null,
      breaking: 'return',
      value: { type: 'string', value: valueToStr(value, pretty.value, false, ctx) },
    }
  },

  trace: ({ pipeTo, at }) => {
    const file: string = matchUnion(at.start.file, 'type', {
      entrypoint: ({ path }) => path,
      file: ({ path }) => path,
      internal: ({ path }) => `<internal:${path}>`,
    })

    pipeTo.stdout.write(`[Trace] ${file}:${at.start.line + 1}:${at.start.col + 1}\n`)

    return { ok: null, breaking: 'return', value: null }
  },

  ls: ({ at, ctx }, map) => {
    const args = getArguments(at, map, { path: 'path' }, ['path'])
    if (args.ok !== true) return args

    const { path } = args.data

    const dir = path.type === 'null' ? process.cwd() : path.segments.join(ctx.platformPathSeparator)

    return {
      ok: null,
      breaking: 'return',
      value: {
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
      },
    }
  },
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
