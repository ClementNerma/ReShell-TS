import { CmdArg, Expr, FnType, Value, ValueType } from './ast'
import { isLocEq } from './loc-cmp'
import { CodeSection, Token } from './parsed'

export type PrecompData = {
  typeAliases: Map<string, { at: CodeSection; content: ValueType }>
  callbackTypes: LocatedPrecomp<FnType>
  fnCalls: LocatedPrecomp<PrecompFnCall | null>
  closuresArgsMapping: LocatedPrecomp<Map<string, string | null>>
}

export type PrecompFnCall = {
  generics: FnCallGeneric[]
  args: Map<string, FnCallPrecompArg>
  restArg: {
    name: string
    content: Token<CmdArg>[]
  } | null
  hasReturnType: boolean
  methodTypeRef: Token<ValueType> | null
}

export type FnCallGeneric = { name: string; orig: CodeSection; resolved: ValueType }

export type FnCallPrecompArg =
  | { type: 'null' }
  | { type: 'false' }
  | { type: 'true' }
  | { type: 'value'; value: Token<Value> }
  | { type: 'expr'; expr: Token<Expr> }
  | { type: 'fnCall'; nameForPrecomp: Token<string> }

export type LocatedPrecomp<T> = Array<{ at: CodeSection; data: T }>

export function getLocatedPrecomp<T>(candidates: LocatedPrecomp<T>, loc: CodeSection): T | undefined {
  const result = candidates.find(
    (candidate) => isLocEq(loc.start, candidate.at.start) // && isLocEq(loc.next, candidate.at.next)
  )

  return result !== undefined ? result.data : result
}
