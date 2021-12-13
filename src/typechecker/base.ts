import { FormatableError, FormatableExtract, FormatableExtractsInput, formattableExtract } from '../shared/errors'
import { CodeLoc, CodeSection, FnType, ValueType } from '../shared/parsed'

export type Typechecker<T, O> = (input: T, context: TypecheckerContext) => TypecheckerResult<O>

export type TypecheckerContext = { scopes: Scope[]; expectedType: ValueType | null }

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
export const err = (err: FormatableExtractsInput, at: CodeSection, also?: FormatableExtract[]): TypecheckerErr => ({
  ok: false,
  error: formattableExtract(at, err),
  also: also ?? [],
})

export type Located<T> = { start: CodeLoc; end: CodeLoc; data: T }

export const located = <T>(start: CodeLoc, end: CodeLoc, data: T): Located<T> => ({ start, end, data })

// export const tokenToLocated = <T>(token: Token<T>): Located<T> => ({ loc: token.start, data: token.parsed })

export const ensureCoverage = (value: never): never => {
  throw new Error('Internal error: reached a theorically unreachable statement')
}
