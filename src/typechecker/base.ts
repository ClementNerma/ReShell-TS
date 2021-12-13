import { buildFormatableExtract, FormatableError, FormatableExtract, FormatableExtractsInput } from '../shared/errors'
import { CodeLoc, Token } from '../shared/parsed'

export type Typechecker<T, C, O> = (input: Token<T>, context: C) => TypecheckerResult<O>

export type TypecheckerRaw<T, C, O> = (input: T, context: C) => TypecheckerResult<O>

export type TypecheckerArr<T, C, O> = (input: Token<T>[], context: C) => TypecheckerResult<O>

export type TypecheckerResult<O> = TypecheckerSuccess<O> | TypecheckerErr

export type TypecheckerSuccess<O> = { ok: true; data: O }

export type TypecheckerErr = { ok: false } & FormatableError

export const success = <O>(data: O): TypecheckerSuccess<O> => ({ ok: true, data })
export const err = (
  err: FormatableExtractsInput | { error: FormatableExtractsInput; also: FormatableExtract[] },
  loc: CodeLoc
): TypecheckerErr =>
  typeof err === 'object' && 'also' in err
    ? { ok: false, error: buildFormatableExtract(loc, err.error), also: err.also }
    : { ok: false, error: buildFormatableExtract(loc, err), also: [] }

export type Located<T> = { loc: CodeLoc; data: T }

export const located = <T>(loc: CodeLoc, data: T): Located<T> => ({ loc, data })

// export const tokenToLocated = <T>(token: Token<T>): Located<T> => ({ loc: token.start, data: token.parsed })

export const ensureCoverage = (value: never): never => {
  throw new Error('Internal error: reached a theorically unreachable statement')
}
