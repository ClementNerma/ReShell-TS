import { ParserLoc, Token } from '../lib/base'

export type Typechecker<T, C, O, E> = (input: Token<T>, context: C) => TypecheckerResult<O, E>

export type TypecheckerResult<O, E> = { ok: true; data: O } | { ok: false; err: E; loc: ParserLoc }

export const success = <O, E>(data: O): TypecheckerResult<O, E> => ({ ok: true, data })
export const err = <O, E>(err: E, loc: ParserLoc): TypecheckerResult<O, E> => ({ ok: false, err, loc })
