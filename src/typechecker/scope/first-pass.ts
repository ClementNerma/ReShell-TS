// 1. Find all declared functions and type alias
// 2. Discover scope sequentially using the items above

import { FnType, StatementChain, ValueType } from '../../shared/parsed'
import { located, Located, success, TypecheckerArr } from '../base'
import { ensureScopeUnicity } from './search'

export type Scope = {
  typeAliases: Map<string, ScopeTypeAlias>
  functions: Map<string, ScopeFn>
  variables: Map<string, ScopeVar>
}

export type ScopeTypeAlias = Located<ValueType>
export type ScopeFn = Located<FnType>
export type ScopeVar = Located<{ mutable: boolean; type: ValueType }>

export type ScopeFirstPass = {
  typeAliases: Map<string, Located<ValueType>>
  functions: Map<string, Located<FnType>>
}

export const scopeFirstPass: TypecheckerArr<StatementChain, Scope[], ScopeFirstPass> = (chain, parents) => {
  const firstPass: ScopeFirstPass = { typeAliases: new Map(), functions: new Map() }

  for (const stmt of chain) {
    if (stmt.parsed.type === 'empty') continue

    for (const sub of [stmt.parsed.start].concat(stmt.parsed.sequence.map((c) => c.parsed.chainedStatement))) {
      switch (sub.parsed.type) {
        case 'typeAlias':
          const typename = sub.parsed.typename.parsed

          const typeUnicity = ensureScopeUnicity([typename, sub.parsed.typename.start], { scopes: parents, firstPass })
          if (!typeUnicity.ok) return typeUnicity

          firstPass.typeAliases.set(typename, located(sub.start, sub.parsed.content.parsed))
          break

        case 'fnDecl':
          const fnName = sub.parsed.name.parsed

          const fnUnicity = ensureScopeUnicity([fnName, sub.parsed.name.start], { scopes: parents, firstPass })
          if (!fnUnicity.ok) return fnUnicity

          firstPass.functions.set(fnName, located(sub.start, sub.parsed.fnType))
          break
      }
    }
  }

  return success(firstPass)
}
