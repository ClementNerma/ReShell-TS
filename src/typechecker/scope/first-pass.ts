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

          // The following check was originally implemented:
          //
          // ```
          // if (ctx.scopes.length > 0) {
          //   return err(typename.at, 'Type aliases can only be defined at top level')
          // }
          // ```
          //
          // It was required for the case where a value of a type named e.g. `X` defined in a scope would be
          // returned to the parent scope, and then used in another sub scope defining another type named `X`
          // Given the informations we have in the AST, this would lead the types to be resolved as the same one,
          // which would result in the types always being shown as compatible even if they weren't.
          //
          // Eventually, we don't need this check as there is no way to leak a scoped type alias to the parent scope
          // Generics are not supported, values of the universal `unknown` type are typed as such and not as their
          // underlying type, so we don't need to perform an additional check here.

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
