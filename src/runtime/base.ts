import { Writable } from 'stream'
import { Block, ClosureBody, ValueType } from '../shared/ast'
import { diagnostic, Diagnostic, DiagnosticLevel } from '../shared/diagnostics'
import { CodeSection, Token } from '../shared/parsed'
import { PrecompData } from '../shared/precomp'

export type Runner<T, RetType = void> = (token: T, ctx: RunnerContext) => RunnerResult<RetType>

export type RunnerResult<T> =
  | { ok: true; data: T }
  | { ok: false; diag: Diagnostic }
  | { ok: null; breaking: 'continue' | 'break' }
  | { ok: null; breaking: 'return'; value: ExecValue | null }

export type RunnerContext = {
  scopes: Scope[]
  methods: { methodTypeRef: Token<ValueType>; body: Token<Block> }[]
  pipeTo: null | {
    stdout: Writable
    stderr: Writable
  }
  typeAliases: PrecompData['typeAliases']
  callbackTypes: PrecompData['callbackTypes']
  fnOrCmdCalls: PrecompData['fnCalls']
  closuresArgsMapping: PrecompData['closuresArgsMapping']
  platformPathSeparator: string
  argv: string[]
  emitDiagnostic: (diagnostic: Diagnostic) => void
}

export const createRunnerContext = (
  precompData: PrecompData,
  platformPathSeparator: string,
  argv: string[],
  diagnosticHandler: RunnerContext['emitDiagnostic']
): RunnerContext => ({
  scopes: [],
  methods: [],
  pipeTo: null,
  typeAliases: precompData.typeAliases,
  callbackTypes: precompData.callbackTypes,
  fnOrCmdCalls: precompData.fnCalls,
  closuresArgsMapping: precompData.closuresArgsMapping,
  platformPathSeparator,
  argv,
  emitDiagnostic: diagnosticHandler,
})

export type Scope = {
  generics: { name: string; orig: CodeSection; resolved: ValueType }[]
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
  | { type: 'fn'; body: Token<Block> }
  | { type: 'callback'; body: ClosureBody; argsMapping: Map<string, string> }
  | { type: 'failable'; success: boolean; value: ExecValue }
  | { type: 'rest'; content: string[] }

export function success<T>(data: T): RunnerResult<T> {
  return { ok: true, data }
}

export function err<T>(at: CodeSection, message: string): RunnerResult<T> {
  return { ok: false, diag: diagnostic(at, message, DiagnosticLevel.Error) }
}

export function ensureCoverage(_: never): never {
  throw new Error('Internal error: reached a theorically unreachable statement')
}
