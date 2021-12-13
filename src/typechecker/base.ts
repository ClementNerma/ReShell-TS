import { CmdDeclSubCommand, FnType, ValueType } from '../shared/ast'
import { Diagnostic, diagnostic, DiagnosticInput, DiagnosticLevel } from '../shared/diagnostics'
import { CodeSection, Token } from '../shared/parsed'
import { PrecompData } from '../shared/precomp'
import { nativeLibraryScope } from './scope/native-lib'

export type Typechecker<T, O> = (input: T, context: TypecheckerContext) => TypecheckerResult<O>

export type TypecheckerContext = {
  scopes: Scope[]
  typeAliases: PrecompData['typeAliases']
  resolvedGenerics: GenericResolutionScope[]
  inLoop: boolean
  typeExpectation: null | { type: ValueType; from: CodeSection | null }
  typeExpectationNature: null | string
  fnExpectation: null | {
    returnType: { type: ValueType; from: CodeSection } | null
  }
  restArgs: string[]
  commandDeclarations: Map<string, { at: CodeSection; content: CmdDeclSubCommand }>
  callbackTypes: PrecompData['callbackTypes']
  fnCalls: PrecompData['fnCalls']
  checkIfCommandExists: (name: string) => boolean
  emitDiagnostic: (diagnostic: Diagnostic) => void
}

export function createTypecheckerContext(
  cmdChecker: TypecheckerContext['checkIfCommandExists'],
  diagnosticHandler: TypecheckerContext['emitDiagnostic']
): TypecheckerContext {
  return {
    scopes: [nativeLibraryScope()],
    typeAliases: new Map(),
    resolvedGenerics: [],
    inLoop: false,
    typeExpectation: null,
    typeExpectationNature: null,
    fnExpectation: null,
    restArgs: [],
    commandDeclarations: new Map(),
    callbackTypes: [],
    fnCalls: [],
    checkIfCommandExists: cmdChecker,
    emitDiagnostic: diagnosticHandler,
  }
}

export type TypecheckerResult<O> = TypecheckerSuccess<O> | TypecheckerErr

export type TypecheckerSuccess<O> = { ok: true; data: O }

export type TypecheckerErr = { ok: false } & Diagnostic

export type Scope = Map<string, ScopeEntity>

export type ScopeEntity =
  | { type: 'fn'; at: CodeSection; content: FnType }
  | { type: 'generic'; name: Token<string> }
  | ({ type: 'var'; at: CodeSection } & ScopeVar)

export type ScopeVar = { mutable: boolean; varType: ValueType }

export type GenericResolutionScope = { name: Token<string>; orig: CodeSection; mapped: ValueType | null }[]

export const success = <O>(data: O): TypecheckerSuccess<O> => ({ ok: true, data })
export const err = (at: CodeSection, err: DiagnosticInput): TypecheckerErr => ({
  ok: false,
  ...diagnostic(at, err, DiagnosticLevel.Error),
})

export const ensureCoverage = (_: never): never => {
  throw new Error('Internal error: reached a theorically unreachable statement')
}
