import { lstatSync, readdirSync } from 'fs'
import { join } from 'path'
import { ValueType } from '../shared/ast'
import { buildWithNativeLibraryFunctionNames, buildWithNativeLibraryVarNames } from '../shared/native-lib'
import { CodeSection } from '../shared/parsed'
import { matchUnion } from '../shared/utils'
import { err, ExecValue, RunnerContext, RunnerResult, success } from './base'

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

  echo: ({ at, pipeTo }, map) => {
    const args = getArguments(at, map, { message: 'string', n: 'bool' })
    if (args.ok !== true) return args

    const { message, n } = args.data
    pipeTo.stdout.write(n.value ? message.value : message.value + '\n')

    return { ok: null, breaking: 'return', value: null }
  },

  dump: ({ at, ctx, pipeTo }, map) => {
    const valueToStr = (value: ExecValue): string =>
      matchUnion(value, 'type', {
        null: () => 'null',
        bool: ({ value }) => (value ? 'true' : 'false'),
        number: ({ value }) => value.toString(),
        string: ({ value }) => `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`,
        path: ({ segments }) => segments.join(ctx.platformPathSeparator),
        list: ({ items }) => `[${items.map((item) => valueToStr(item)).join(', ')}]`,
        map: ({ entries }) =>
          `map:( ${[...entries]
            .map(([entry, value]) => `"${entry.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}": ${valueToStr(value)}`)
            .join(', ')} )`,
        struct: ({ members }) =>
          `{ ${[...members.entries()].map(([member, value]) => `${member}: ${valueToStr(value)}`).join(', ')} }`,
        enum: ({ variant }) => `enum::${variant}`,
        fn: () => `<declared function>`,
        callback: () => `<callback>`,
        failable: ({ success, value }) => `${success ? 'ok' : 'err'}(${valueToStr(value)})`,
        rest: () => `<rest>`,
      })

    const args = getArguments(at, map, { value: 'unknown' })
    if (args.ok !== true) return args

    const { value } = args.data
    pipeTo.stdout.write(valueToStr(value) + '\n')

    return { ok: null, breaking: 'return', value: null }
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

  ls: () => {
    const cwd = process.cwd()

    return {
      ok: null,
      breaking: 'return',
      value: {
        type: 'list',
        items: readdirSync(cwd).map((name): ExecValue => {
          const item = lstatSync(join(cwd, name))

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

function getArguments<A extends { [name: string]: ValueType['type'] }>(
  at: CodeSection,
  map: Map<string, ExecValue>,
  expecting: A
): RunnerResult<{ [name in keyof A]: Extract<ExecValue, { type: A[name] }> }> {
  const out: object = {}

  for (const [name, type] of Object.entries(expecting)) {
    const value = map.get(name)
    if (value === undefined)
      return err(at, `internal error in native library executor: argument "${name}" was not found`)
    if (value.type !== type && type !== 'unknown') {
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
