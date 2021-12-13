import { buildWithNativeLibraryFunctionNames, buildWithNativeLibraryVarNames } from '../shared/native-lib'
import { ExecValue, RunnerContext, RunnerResult, success } from './base'

export const nativeLibraryVariables = buildWithNativeLibraryVarNames<(ctx: RunnerContext) => ExecValue>({
  argv: (ctx) => ({ type: 'list', items: [] }),
  PATH: (ctx) => ({ type: 'list', items: [] }),
})

export type NativeFn = (ctx: RunnerContext, ...args: ExecValue[]) => RunnerResult<ExecValue>

export const nativeLibraryFunctions = buildWithNativeLibraryFunctionNames<NativeFn>({
  echo: (ctx, message) => {
    console.log(message.type === 'string' ? message.value : '<echo: invalid string value>')
    return success({ type: 'null' })
  },
})
