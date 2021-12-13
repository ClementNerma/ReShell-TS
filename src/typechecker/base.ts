import { ParserLoc, Token } from '../lib/base'

export type Typechecker<T, C, O> = (input: Token<T>, context: C) => TypecheckerResult<O>

export type TypecheckerRaw<T, C, O> = (input: T, context: C) => TypecheckerResult<O>

export type TypecheckerArr<T, C, O> = (input: Token<T>[], context: C) => TypecheckerResult<O>

export type TypecheckerErr = string | { message: string; complements: [string, string][] }

export type TypecheckerResult<O> = { ok: true; data: O } | { ok: false; err: TypecheckerErr; loc: ParserLoc }

export const success = <O>(data: O): TypecheckerResult<O> => ({ ok: true, data })
export const err = <O>(err: TypecheckerErr, loc: ParserLoc): TypecheckerResult<O> => ({ ok: false, err, loc })

export type Located<T> = { loc: ParserLoc; data: T }

export const located = <T>(loc: ParserLoc, data: T): Located<T> => ({ loc, data })

export const tokenToLocated = <T>(token: Token<T>): Located<T> => ({ loc: token.start, data: token.parsed })

export const ensureCoverage = (value: never): never => {
  throw new Error('Internal error: reached a theorically unreachable statement')
}
