import { FnType, ValueType } from '../shared/ast'
import { FormatableErrInput, FormatableError, formattableErr } from '../shared/errors'
import { CodeSection } from '../shared/parsed'

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
  expectedFailureWriter: null | { ref: null | Located<ValueType> }
  checkIfCommandExists: (name: string) => boolean
}

export function createTypecheckerContext(cmdChecker: TypecheckerContext['checkIfCommandExists']): TypecheckerContext {
  return {
    scopes: [],
    inLoop: false,
    typeExpectation: null,
    typeExpectationNature: null,
    fnExpectation: null,
    expectedFailureWriter: null,
    checkIfCommandExists: cmdChecker,
  }
}

export type TypecheckerResult<O> = TypecheckerSuccess<O> | TypecheckerErr

export type TypecheckerSuccess<O> = { ok: true; data: O }

export type TypecheckerErr = { ok: false } & FormatableError

export type Scope = {
  typeAliases: Map<string, ScopeTypeAlias>
  functions: Map<string, ScopeFn>
  variables: Map<string, ScopeVar>
}

export type ScopeTypeAlias = Located<ValueType>
export type ScopeFn = Located<FnType>
export type ScopeVar = Located<{ mutable: boolean; type: ValueType }>

export const success = <O>(data: O): TypecheckerSuccess<O> => ({ ok: true, data })
export const err = (at: CodeSection, err: FormatableErrInput): TypecheckerErr => ({
  ok: false,
  ...formattableErr(at, err),
})

export type Located<T> = { at: CodeSection; content: T }

export const located = <T>(at: CodeSection, content: T): Located<T> => ({ at, content })

// export const tokenToLocated = <T>(token: Token<T>): Located<T> => ({ loc: token.start, data: token.parsed })

export const ensureCoverage = (value: never): never => {
  throw new Error('Internal error: reached a theorically unreachable statement')
}
