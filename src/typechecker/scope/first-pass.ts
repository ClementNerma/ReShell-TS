// 1. Find all declared functions and type alias
// 2. Discover scope sequentially using the items above

import { StatementChain } from '../../shared/ast'
import { Token } from '../../shared/parsed'
import { err, located, Scope, success, Typechecker } from '../base'
import { statementChainChecker } from '../statement'
import { fnTypeValidator } from '../types/fn'
import { ensureScopeUnicity, getFunctionInScope, getTypeAliasInScope, getVariableInScope } from './search'

export const scopeFirstPass: Typechecker<Token<StatementChain>[], Scope> = (chain, ctx) => {
  const withFileInclusions = scopeFirstPassFileInclusions(chain, ctx)
  if (!withFileInclusions.ok) return withFileInclusions

  const firstPass = withFileInclusions.data

  const typeAliases = completeScopeFirstPassTypeAliases([chain, firstPass], ctx)
  if (!typeAliases.ok) return typeAliases

  const functions = completeScopeFirstPassFunctions([chain, firstPass], ctx)
  if (!functions.ok) return functions

  return success(firstPass)
}

const scopeFirstPassFileInclusions: Typechecker<Token<StatementChain>[], Scope> = (chain, ctx) => {
  const currentScope: Scope = { typeAliases: new Map(), functions: new Map(), variables: new Map() }

  ctx = {
    ...ctx,
    scopes: ctx.scopes.concat([currentScope]),
  }

  for (const stmt of chain) {
    if (stmt.parsed.type === 'empty') continue

    for (const sub of [stmt.parsed.start].concat(stmt.parsed.sequence.map((c) => c.parsed.chainedStatement))) {
      switch (sub.parsed.type) {
        case 'fileInclusion':
          const check = statementChainChecker(sub.parsed.content, ctx)
          if (!check.ok) return check

          if (sub.parsed.imports === null) {
            break
          }

          const scope = check.data.topLevelScope

          for (const { entity, alias } of sub.parsed.imports) {
            const typeAlias = getTypeAliasInScope(entity, { ...ctx, scopes: [scope] })

            if (typeAlias.ok) {
              const unicity = ensureScopeUnicity(alias ?? entity, ctx)
              if (!unicity.ok) return unicity

              currentScope.typeAliases.set(alias?.parsed ?? entity.parsed, located(entity.at, typeAlias.data.content))
            } else {
              const fn = getFunctionInScope(entity, { ...ctx, scopes: [scope] })

              if (fn.ok) {
                const unicity = ensureScopeUnicity(alias ?? entity, ctx)
                if (!unicity.ok) return unicity

                currentScope.functions.set(alias?.parsed ?? entity.parsed, located(entity.at, fn.data.content))
              } else {
                const variable = getVariableInScope(entity, { ...ctx, scopes: [scope] })

                if (variable.ok) {
                  currentScope.variables.set(alias?.parsed ?? entity.parsed, located(entity.at, variable.data.content))
                } else {
                  return err(entity.at, `entity \`${entity.parsed}\` was not found in this file`)
                }
              }
            }
          }
          break
      }
    }
  }

  return success(currentScope)
}

const completeScopeFirstPassTypeAliases: Typechecker<[Token<StatementChain>[], Scope], void> = (
  [chain, scope],
  ctx
) => {
  ctx = { ...ctx, scopes: ctx.scopes.concat(scope) }

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
          //   return err(typename.at, 'type aliases can only be defined at top level')
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

          scope.typeAliases.set(typename.parsed, located(typename.at, sub.parsed.content.parsed))
          break
      }
    }
  }

  return success(void 0)
}

const completeScopeFirstPassFunctions: Typechecker<[Token<StatementChain>[], Scope], void> = ([chain, scope], ctx) => {
  ctx = { ...ctx, scopes: ctx.scopes.concat(scope) }

  for (const stmt of chain) {
    if (stmt.parsed.type === 'empty') continue

    for (const sub of [stmt.parsed.start].concat(stmt.parsed.sequence.map((c) => c.parsed.chainedStatement))) {
      switch (sub.parsed.type) {
        case 'fnDecl':
          const fnName = sub.parsed.name
          const fnUnicity = ensureScopeUnicity(fnName, ctx)
          if (!fnUnicity.ok) return fnUnicity

          const fnTypeChecker = fnTypeValidator(sub.parsed.fnType, ctx)
          if (!fnTypeChecker.ok) return fnTypeChecker

          scope.functions.set(fnName.parsed, located(fnName.at, sub.parsed.fnType))
          break
      }
    }
  }

  return success(void 0)
}
