import { buildFormatableExtract, FormatableExtract, FormatableExtractsInput, ParserLoc, Token } from '../lib/base'

export type Typechecker<T, C, O> = (input: Token<T>, context: C) => TypecheckerResult<O>

export type TypecheckerRaw<T, C, O> = (input: T, context: C) => TypecheckerResult<O>

export type TypecheckerArr<T, C, O> = (input: Token<T>[], context: C) => TypecheckerResult<O>

export type TypecheckerResult<O> =
  | { ok: true; data: O }
  | { ok: false; loc: ParserLoc; error: FormatableExtract; also: FormatableExtract[] }

export const success = <O>(data: O): TypecheckerResult<O> => ({ ok: true, data })
export const err = <O>(
  err: FormatableExtractsInput | { error: FormatableExtractsInput; also: FormatableExtract[] },
  loc: ParserLoc
): TypecheckerResult<O> =>
  typeof err === 'object' && 'also' in err
    ? { ok: false, loc, error: buildFormatableExtract(loc, err.error), also: err.also }
    : { ok: false, loc, error: buildFormatableExtract(loc, err), also: [] }

export type Located<T> = { loc: ParserLoc; data: T }

export const located = <T>(loc: ParserLoc, data: T): Located<T> => ({ loc, data })

export const tokenToLocated = <T>(token: Token<T>): Located<T> => ({ loc: token.start, data: token.parsed })

export const ensureCoverage = (value: never): never => {
  throw new Error('Internal error: reached a theorically unreachable statement')
}
