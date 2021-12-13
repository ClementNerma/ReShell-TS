// 1. Find all declared functions and type alias
// 2. Discover scope sequentially using the items above

import { FnType, StatementChain, Token, ValueType } from '../../shared/parsed'
import { located, Located, success, Typechecker } from '../base'
import { ensureScopeUnicity } from './search'

export type ScopeFirstPass = {
  typeAliases: Map<string, Located<ValueType>>
  functions: Map<string, Located<FnType>>
}

export const scopeFirstPass: Typechecker<Token<StatementChain>[], ScopeFirstPass> = (chain, ctx) => {
  const firstPass: ScopeFirstPass = { typeAliases: new Map(), functions: new Map() }

  for (const stmt of chain) {
    if (stmt.parsed.type === 'empty') continue

    for (const sub of [stmt.parsed.start].concat(stmt.parsed.sequence.map((c) => c.parsed.chainedStatement))) {
      switch (sub.parsed.type) {
        case 'typeAlias':
          const typename = sub.parsed.typename

          const typeUnicity = ensureScopeUnicity({ name: typename, firstPass }, ctx)
          if (!typeUnicity.ok) return typeUnicity

          firstPass.typeAliases.set(typename.parsed, located(typename.at, sub.parsed.content.parsed))
          break

        case 'fnDecl':
          const fnName = sub.parsed.name

          const fnUnicity = ensureScopeUnicity({ name: fnName, firstPass }, ctx)
          if (!fnUnicity.ok) return fnUnicity

          firstPass.functions.set(fnName.parsed, located(fnName.at, sub.parsed.fnType))
          break
      }
    }
  }

  return success(firstPass)
}
