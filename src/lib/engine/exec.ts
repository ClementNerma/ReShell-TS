import { ParserLoc, Token } from '../base'

export type Executor<T, C, O, E> = (input: Token<T>, context: C) => ExecutorResult<O, E>

export type ExecutorResult<O, E> = { ok: true; data: O } | { ok: false; err: E; loc: ParserLoc }

export const success = <O, E>(data: O): ExecutorResult<O, E> => ({ ok: true, data })
export const err = <O, E>(err: E, loc: ParserLoc): ExecutorResult<O, E> => ({ ok: false, err, loc })
