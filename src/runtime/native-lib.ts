import { lstatSync, readdirSync } from 'fs'
import { join } from 'path'
import { buildWithNativeLibraryFunctionNames, buildWithNativeLibraryVarNames } from '../shared/native-lib'
import { CodeSection } from '../shared/parsed'
import { matchUnion } from '../shared/utils'
import { ExecValue, RunnerContext, RunnerResult } from './base'

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
  ...args: ExecValue[]
) => RunnerResult<ExecValue>

export const nativeLibraryFunctions = buildWithNativeLibraryFunctionNames<NativeFn>({
  ok: (_, value) => ({ ok: null, breaking: 'return', value: { type: 'failable', success: true, value } }),

  err: (_, error) => ({
    ok: null,
    breaking: 'return',
    value: { type: 'failable', success: false, value: error },
  }),

  echo: ({ pipeTo }, message) => {
    pipeTo.stdout.write(message.type === 'string' ? message.value : '<echo: invalid string value>')
    return { ok: null, breaking: 'return', value: null }
  },

  dump: ({ ctx, pipeTo }, value) => {
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

    pipeTo.stdout.write(valueToStr(value))

    return { ok: null, breaking: 'return', value: null }
  },

  trace: ({ pipeTo, at }) => {
    const file: string = matchUnion(at.start.file, 'type', {
      entrypoint: ({ path }) => path,
      file: ({ path }) => path,
      internal: ({ path }) => `<internal:${path}>`,
    })

    pipeTo.stdout.write(`[Trace] ${file}:${at.start.line + 1}:${at.start.col + 1}`)

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
            members: new Map([
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
            ]),
          }
        }),
      },
    }
  },
})
