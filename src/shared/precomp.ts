import { CmdArg, Expr, FnType, Value, ValueType } from './ast'
import { isLocEq } from './loc-cmp'
import { CodeSection, Token } from './parsed'

export type PrecompData = {
  typeAliases: Map<string, { at: CodeSection; content: ValueType }>
  callbackTypes: LocatedPrecomp<FnType>
  fnCalls: LocatedPrecomp<FnCallPrecomp>
}

export type FnCallPrecomp = {
  generics: Map<string, ValueType>
  args: Map<string, FnCallPrecompArg>
  restArg: {
    name: string
    content: Token<CmdArg>[]
  } | null
}

export type FnCallPrecompArg =
  | { type: 'null' }
  | { type: 'value'; value: Token<Value> }
  | { type: 'expr'; expr: Token<Expr> }

export type LocatedPrecomp<T> = Array<{ at: CodeSection; data: T }>

export function getLocatedPrecomp<T>(candidates: LocatedPrecomp<T>, loc: CodeSection): T | undefined {
  const result = candidates.find(
    (candidate) => isLocEq(loc.start, candidate.at.start) && isLocEq(loc.next, candidate.at.next)
  )

  return result !== undefined ? result.data : result
}
