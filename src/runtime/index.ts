import { Program } from '../shared/ast'
import { Diagnostic } from '../shared/diagnostics'
import { Token } from '../shared/parsed'
import { RunnerContext } from './base'
import { runProgram } from './program'

export type ExecResult = { ok: true } | { ok: false; diag: Diagnostic }

export function execProgram(program: Token<Program>, ctx: RunnerContext): ExecResult {
  const result = runProgram(program.parsed, ctx)
  return result.ok === false ? result : { ok: true }
}
