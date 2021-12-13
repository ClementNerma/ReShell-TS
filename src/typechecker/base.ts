import { CmdDeclSubCommand, FnType, ValueType } from '../shared/ast'
import { Diagnostic, diagnostic, DiagnosticInput, DiagnosticLevel } from '../shared/diagnostics'
import { CodeSection, Token } from '../shared/parsed'
import { nativeLibraryScope } from './scope/native-lib'

export type Typechecker<T, O> = (input: T, context: TypecheckerContext) => TypecheckerResult<O>

export type TypecheckerContext = {
  scopes: Scope[]
  inLoop: boolean
  typeExpectation: null | { type: ValueType; from: CodeSection | null }
  typeExpectationNature: null | string
  fnExpectation: null | {
    returnType: { type: ValueType; from: CodeSection } | null
    failureType: { type: ValueType; from: CodeSection } | null
  }
  restArgs: string[]
  expectedFailureWriter: null | { ref: null | { at: CodeSection; content: ValueType } }
  commandDeclarations: Map<string, { at: CodeSection; content: CmdDeclSubCommand }>
  checkIfCommandExists: (name: string) => boolean
  emitDiagnostic: (diagnostic: Diagnostic) => void
}

export function createTypecheckerContext(
  cmdChecker: TypecheckerContext['checkIfCommandExists'],
  diagnosticHandler: TypecheckerContext['emitDiagnostic']
): TypecheckerContext {
  return {
    scopes: [nativeLibraryScope()],
    inLoop: false,
    typeExpectation: null,
    typeExpectationNature: null,
    fnExpectation: null,
    restArgs: [],
    expectedFailureWriter: null,
    commandDeclarations: new Map(),
    checkIfCommandExists: cmdChecker,
    emitDiagnostic: diagnosticHandler,
  }
}

export type TypecheckerResult<O> = TypecheckerSuccess<O> | TypecheckerErr

export type TypecheckerSuccess<O> = { ok: true; data: O }

export type TypecheckerErr = { ok: false } & Diagnostic

export type Scope = Map<string, ScopeEntity>

export type ScopeEntity =
  | { type: 'typeAlias'; at: CodeSection; content: ValueType }
  | { type: 'fn'; at: CodeSection; content: FnType }
  | { type: 'generic'; at: CodeSection; name: Token<string> }
  | ({ type: 'var'; at: CodeSection } & ScopeVar)

export type ScopeVar = { mutable: boolean; varType: ValueType }

export const success = <O>(data: O): TypecheckerSuccess<O> => ({ ok: true, data })
export const err = (at: CodeSection, err: DiagnosticInput): TypecheckerErr => ({
  ok: false,
  ...diagnostic(at, err, DiagnosticLevel.Error),
})

export const ensureCoverage = (value: never): never => {
  throw new Error('Internal error: reached a theorically unreachable statement')
}
