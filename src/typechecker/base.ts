import { CmdDeclSubCommand, FnType, MethodInfos, ValueType } from '../shared/ast'
import { Diagnostic, diagnostic, DiagnosticInput, DiagnosticLevel } from '../shared/diagnostics'
import { CodeLoc, CodeSection, Token } from '../shared/parsed'
import { PrecompData } from '../shared/precomp'
import { nativeLibraryScope, nativeLibraryTypeAliasesMap } from './scope/native-lib'

export type Typechecker<T, O> = (input: T, context: TypecheckerContext) => TypecheckerResult<O>

export type TypecheckerContext = {
  scopes: Scope[]
  typeAliasesPrelook: Set<string>
  typeAliases: PrecompData['typeAliases']
  resolvedGenerics: GenericResolutionScope
  inLoop: boolean
  inFnCallAt: CodeLoc | null
  typeExpectation: null | { type: ValueType; from: CodeSection | null }
  typeExpectationNature: null | string
  fnExpectation: null | {
    returnType: { type: ValueType; from: CodeSection } | null
  }
  restArgs: string[]
  commandDeclarations: Map<string, { at: CodeSection; content: CmdDeclSubCommand }>
  callbackTypes: PrecompData['callbackTypes']
  fnOrCmdCalls: PrecompData['fnOrCmdCalls']
  closuresArgsMapping: PrecompData['closuresArgsMapping']
  checkIfCommandExists: (name: string) => boolean
  emitDiagnostic: (diagnostic: Diagnostic) => void
}

export function createTypecheckerContext(
  cmdChecker: TypecheckerContext['checkIfCommandExists'],
  diagnosticHandler: TypecheckerContext['emitDiagnostic']
): TypecheckerContext {
  return {
    scopes: [nativeLibraryScope()],
    typeAliases: nativeLibraryTypeAliasesMap(),
    typeAliasesPrelook: new Set(nativeLibraryTypeAliasesMap().keys()),
    resolvedGenerics: [],
    inLoop: false,
    inFnCallAt: null,
    typeExpectation: null,
    typeExpectationNature: null,
    fnExpectation: null,
    restArgs: [],
    commandDeclarations: new Map(),
    callbackTypes: [],
    fnOrCmdCalls: [],
    closuresArgsMapping: [],
    checkIfCommandExists: cmdChecker,
    emitDiagnostic: diagnosticHandler,
  }
}

export type TypecheckerResult<O> = TypecheckerSuccess<O> | TypecheckerErr

export type TypecheckerSuccess<O> = { ok: true; data: O }

export type TypecheckerErr = { ok: false } & Diagnostic

export type Scope = {
  generics: Map<string, CodeSection>
  methods: ScopeMethod[]
  entities: Map<string, ScopeEntity>
}

export type ScopeEntity =
  | { type: 'fn'; at: CodeSection; content: FnType }
  | { type: 'var'; at: CodeSection; mutable: boolean; varType: ValueType }

export type ScopeMethod = {
  name: Token<string>
  forTypeWithoutGenerics: ValueType
  infos: MethodInfos
  fnType: FnType
}

export type GenericResolutionScope = {
  name: Token<string>
  orig: CodeSection
  mapped: ValueType | null
  inFnCallAt: CodeLoc
}[]

export const success = <O>(data: O): TypecheckerSuccess<O> => ({ ok: true, data })
export const err = (at: CodeSection, err: DiagnosticInput): TypecheckerErr => ({
  ok: false,
  ...diagnostic(at, err, DiagnosticLevel.Error),
})

export const ensureCoverage = (_: never): never => {
  throw new Error('Internal error: reached a theorically unreachable statement')
}
