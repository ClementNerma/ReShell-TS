import { Program } from '../shared/ast'
import { Diagnostic } from '../shared/diagnostics'
import { Token } from '../shared/parsed'
import { RunnerContext } from './base'
import { runProgram } from './program'

export function execProgram(
  program: Token<Program>,
  ctx: RunnerContext
): { ok: true } | { ok: false; diag: Diagnostic } {
  const result = runProgram(program.parsed, ctx)
  return result.ok === false ? result : { ok: true }
}
