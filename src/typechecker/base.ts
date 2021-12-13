import { ParserLoc, Token } from '../lib/base'

export type Typechecker<T, C, O, E> = (input: Token<T>, context: C) => TypecheckerResult<O, E>

export type TypecheckerRaw<T, C, O, E> = (input: T, context: C) => TypecheckerResult<O, E>

export type TypecheckerArr<T, C, O, E> = (input: Token<T>[], context: C) => TypecheckerResult<O, E>

export type TypecheckerResult<O, E> = { ok: true; data: O } | { ok: false; err: E; loc: ParserLoc }

export const success = <O, E>(data: O): TypecheckerResult<O, E> => ({ ok: true, data })
export const err = <O, E>(err: E, loc: ParserLoc): TypecheckerResult<O, E> => ({ ok: false, err, loc })

export type Located<T> = { loc: ParserLoc; data: T }

export const located = <T>(loc: ParserLoc, data: T): Located<T> => ({ loc, data })

export const tokenToLocated = <T>(token: Token<T>): Located<T> => ({ loc: token.start, data: token.parsed })

export const ensureCoverage = (value: never): never => {
  throw new Error('Internal error: reached a theorically unreachable statement')
}
