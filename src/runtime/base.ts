import { Block, ClosureBody } from '../shared/ast'
import { diagnostic, Diagnostic, DiagnosticLevel } from '../shared/diagnostics'
import { CodeSection } from '../shared/parsed'

export type Runner<T, RetType = void> = (token: T, ctx: RunnerContext) => RunnerResult<RetType>

export type RunnerResult<T> =
  | { ok: true; data: T }
  | { ok: false; diag: Diagnostic }
  | { ok: null; breaking: 'continue' | 'break' }
  | { ok: null; breaking: 'return'; value: ExecValue | null }

export type RunnerContext = {
  scopes: Scope[]
}

export const createRunnerContext = (): RunnerContext => ({
  scopes: [],
})

export type Scope = {
  functions: string[]
  entities: Map<string, ExecValue>
}

export type ExecValue =
  | { type: 'null'; value: null }
  | { type: 'bool'; value: boolean }
  | { type: 'number'; value: number }
  | { type: 'string'; value: string }
  | { type: 'path'; segments: string[] }
  | { type: 'list'; items: ExecValue[] }
  | { type: 'map'; entries: Map<string, ExecValue> }
  | { type: 'struct'; members: Map<string, ExecValue> }
  | { type: 'enum'; variant: string }
  | { type: 'fn'; def: { args: string[]; restArg: string | null }; body: Block }
  | { type: 'callback'; def: { args: string[]; restArg: string | null }; body: ClosureBody }
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
