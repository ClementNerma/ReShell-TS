// 1. Find all declared functions and type alias
// 2. Discover scope sequentially using the items above

import { StatementChain, Token } from '../../shared/parsed'
import { located, Scope, success, Typechecker } from '../base'
import { fnTypeValidator } from '../types/fn'
import { ensureScopeUnicity } from './search'

export const scopeFirstPass: Typechecker<Token<StatementChain>[], Scope> = (chain, ctx) => {
  const firstPass: Scope = { typeAliases: new Map(), functions: new Map(), variables: new Map() }

  ctx = { ...ctx, scopes: ctx.scopes.concat([firstPass]) }

  for (const stmt of chain) {
    if (stmt.parsed.type === 'empty') continue

    for (const sub of [stmt.parsed.start].concat(stmt.parsed.sequence.map((c) => c.parsed.chainedStatement))) {
      switch (sub.parsed.type) {
        case 'typeAlias':
          const typename = sub.parsed.typename

          // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~ Notes on scoped type aliases leaking ~~~~~~~~~~~~~~~~~~~~~~~~~~~~
          //
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
          // Eventually, we don't need this check as there is no way to leak a value which uses a scoped type alias
          // to the parent scope: generics are not supported, values of the universal `unknown` type are typed as such
          // and not as their underlying type, so we don't need to perform an additional check here.
          //
          // There is a specific case though which is best illustrated with the following code:
          //
          // ```
          // let data: list[ { member: string } ] = []
          //
          // if rand() {
          //     type A = { member: string }
          //     let value: A = { member: "Hello" }
          //
          //     data[] = value
          // } else {
          //     type B = { member: string }
          //     let value: B = { member: "Hello" }
          //
          //     data[] = value
          // }
          // ```
          //
          // This is a specific leak case, but it is solved by the way types are resolved:
          // In this code example, when the value is pushed to the list, an expected type (`{ member: string }`)
          // is provided to the type resolver, which will use it to type the underlying value.
          // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

          const typeUnicity = ensureScopeUnicity(typename, ctx)
          if (!typeUnicity.ok) return typeUnicity

          firstPass.typeAliases.set(typename.parsed, located(typename.at, sub.parsed.content.parsed))
          break

        case 'fnDecl':
          const fnName = sub.parsed.name

          const fnUnicity = ensureScopeUnicity(fnName, ctx)
          if (!fnUnicity.ok) return fnUnicity

          const fnTypeChecker = fnTypeValidator(sub.parsed.fnType, ctx)
          if (!fnTypeChecker.ok) return fnTypeChecker

          firstPass.functions.set(fnName.parsed, located(fnName.at, sub.parsed.fnType))
          break
      }
    }
  }

  return success(firstPass)
}
