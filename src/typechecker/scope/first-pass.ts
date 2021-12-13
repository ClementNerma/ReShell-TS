// 1. Find all declared functions and type alias
// 2. Discover scope sequentially using the items above

import { Statement, StatementChain } from '../../shared/ast'
import { Token } from '../../shared/parsed'
import { err, Scope, success, Typechecker } from '../base'
import { fnTypeValidator } from '../types/fn'
import { ensureScopeUnicity } from './search'

export const scopeFirstPass: Typechecker<Token<StatementChain>[], Scope> = (chain, ctx) => {
  const firstPass: Scope = new Map()

  ctx = {
    ...ctx,
    scopes: ctx.scopes.concat([firstPass]),
  }

  for (const stmt of flattenStatementChains(chain)) {
    switch (stmt.parsed.type) {
      case 'typeAlias':
        const typename = stmt.parsed.typename

        if (ctx.scopes.length > 2 /* native library has its own scope */) {
          return err(stmt.at, 'type aliases must be defined in the top scope')
        }

        const orig = ctx.typeAliases.get(typename.parsed)

        if (orig) {
          return err(typename.at, {
            message: 'a type alias has already been declared with this name',
            also: [{ at: orig.at, message: 'original declaration occurs here' }],
          })
        }

        ctx.typeAliases.set(typename.parsed, {
          at: typename.at,
          content: stmt.parsed.content.parsed,
        })

        break

      case 'fnDecl':
        const fnName = stmt.parsed.name
        const fnUnicity = ensureScopeUnicity(fnName, ctx)
        if (!fnUnicity.ok) return fnUnicity

        const fnTypeChecker = fnTypeValidator(stmt.parsed.fnType, ctx)
        if (!fnTypeChecker.ok) return fnTypeChecker

        firstPass.set(fnName.parsed, {
          at: fnName.at,
          type: 'fn',
          content: stmt.parsed.fnType,
        })
        break
    }
  }

  return success(firstPass)
}

export function flattenStatementChains(chains: Token<StatementChain>[]): Token<Statement>[] {
  return chains
    .map((chain) =>
      chain.parsed.type === 'empty'
        ? []
        : [chain.parsed.start].concat(chain.parsed.sequence.map((stmt) => stmt.parsed.chainedStatement))
    )
    .flat()
    .map((stmt) => (stmt.parsed.type === 'fileInclusion' ? flattenStatementChains(stmt.parsed.content) : [stmt]))
    .flat()
}
