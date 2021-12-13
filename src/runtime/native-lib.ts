import { lstatSync, readdirSync } from 'fs'
import { join } from 'path'
import { buildWithNativeLibraryFunctionNames, buildWithNativeLibraryVarNames } from '../shared/native-lib'
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

export type NativeFn = (ctx: RunnerContext, ...args: ExecValue[]) => RunnerResult<ExecValue>

export const nativeLibraryFunctions = buildWithNativeLibraryFunctionNames<NativeFn>({
  ok: (ctx, value) => ({ ok: null, breaking: 'return', value: { type: 'failable', success: true, value } }),
  err: (ctx, error) => ({ ok: null, breaking: 'return', value: { type: 'failable', success: false, value: error } }),

  echo: (ctx, message) => {
    console.log(message.type === 'string' ? message.value : '<echo: invalid string value>')
    return { ok: null, breaking: 'return', value: null }
  },

  dump: (ctx, value) => {
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

    console.log(valueToStr(value))

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
