import { Block, ClosureBody, FnType, ValueType } from '../shared/ast'
import { diagnostic, Diagnostic, DiagnosticLevel } from '../shared/diagnostics'
import { CodeSection } from '../shared/parsed'
import { PrecompData } from '../shared/precomp'

export type Runner<T, RetType = void> = (token: T, ctx: RunnerContext) => RunnerResult<RetType>

export type RunnerResult<T> =
  | { ok: true; data: T }
  | { ok: false; diag: Diagnostic }
  | { ok: null; breaking: 'continue' | 'break' }
  | { ok: null; breaking: 'return'; value: ExecValue | null }

export type RunnerContext = {
  scopes: Scope[]
  typeAliases: PrecompData['typeAliases']
  callbackTypes: PrecompData['callbackTypes']
  fnCallGenerics: PrecompData['fnCallGenerics']
}

export const createRunnerContext = (precompData: PrecompData): RunnerContext => ({
  scopes: [],
  typeAliases: precompData.typeAliases,
  callbackTypes: precompData.callbackTypes,
  fnCallGenerics: precompData.fnCallGenerics,
})

export type Scope = {
  generics: { name: string; orig: CodeSection; resolved: ValueType }[]
  functions: string[]
  entities: Map<string, ExecValue>
}

export type ExecValue =
  | { type: 'null' }
  | { type: 'bool'; value: boolean }
  | { type: 'number'; value: number }
  | { type: 'string'; value: string }
  | { type: 'path'; segments: string[] }
  | { type: 'list'; items: ExecValue[] }
  | { type: 'map'; entries: Map<string, ExecValue> }
  | { type: 'struct'; members: Map<string, ExecValue> }
  | { type: 'enum'; variant: string }
  | { type: 'fn'; def: { args: string[]; restArg: string | null }; fnType: FnType; body: Block }
  | { type: 'callback'; def: { args: string[]; restArg: string | null }; fnType: FnType; body: ClosureBody }
  | { type: 'failable'; success: boolean; value: ExecValue }

export function success<T>(data: T): RunnerResult<T> {
  return { ok: true, data }
}

export function err<T>(at: CodeSection, message: string): RunnerResult<T> {
  return { ok: false, diag: diagnostic(at, message, DiagnosticLevel.Error) }
}

export function ensureCoverage(_: never): never {
  throw new Error('Internal error: reached a theorically unreachable statement')
}
