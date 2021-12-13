import { FormatableError, FormatableExtract, FormatableExtractsInput, formattableExtract } from '../shared/errors'
import { CodeLoc, FnType, Token, ValueType } from '../shared/parsed'

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
export const err = (
  err: FormatableExtractsInput | { error: FormatableExtractsInput; also: FormatableExtract[] },
  at: Token<unknown>
): TypecheckerErr =>
  typeof err === 'object' && 'also' in err
    ? { ok: false, error: formattableExtract(at, err.error), also: err.also }
    : { ok: false, error: formattableExtract(at, err), also: [] }

export type Located<T> = { start: CodeLoc; end: CodeLoc; data: T }

export const located = <T>(start: CodeLoc, end: CodeLoc, data: T): Located<T> => ({ start, end, data })

// export const tokenToLocated = <T>(token: Token<T>): Located<T> => ({ loc: token.start, data: token.parsed })

export const ensureCoverage = (value: never): never => {
  throw new Error('Internal error: reached a theorically unreachable statement')
}
