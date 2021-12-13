// 1. Find all declared functions and type alias
// 2. Discover scope sequentially using the items above

import { Block, Statement } from '../../shared/ast'
import { Token } from '../../shared/parsed'
import { err, Scope, success, Typechecker } from '../base'
import { fnTypeValidator } from '../types/fn'
import { typeValidator } from '../types/validator'
import { ensureScopeUnicity } from './search'

export const scopeFirstPass: Typechecker<Block, Scope> = (chain, ctx) => {
  const firstPass: Scope = new Map()

  ctx = {
    ...ctx,
    scopes: ctx.scopes.concat([firstPass]),
  }

  const flattened = flattenBlock(chain)

  for (const stmt of flattened) {
    if (stmt.parsed.type === 'typeAlias' || stmt.parsed.type === 'enumDecl') {
      ctx.typeAliasesPrelook.add(stmt.parsed.typename.parsed)
    }
  }

  for (const stmt of flattened) {
    switch (stmt.parsed.type) {
      case 'typeAlias':
      case 'enumDecl': {
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

        if (stmt.parsed.type === 'typeAlias') {
          const check = typeValidator(stmt.parsed.content.parsed, ctx)
          if (!check.ok) return check
        }

        ctx.typeAliases.set(typename.parsed, {
          at: typename.at,
          content:
            stmt.parsed.type === 'typeAlias'
              ? stmt.parsed.content.parsed
              : { type: 'enum', variants: stmt.parsed.variants },
        })

        break
      }

      case 'fnDecl': {
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
  }

  return success(firstPass)
}

export function flattenBlock(block: Block): Token<Statement>[] {
  return block
    .map((chain) =>
      chain.parsed.type === 'empty'
        ? []
        : [chain.parsed.start].concat(chain.parsed.sequence.map((stmt) => stmt.parsed.chainedStatement))
    )
    .flat()
    .map((stmt) => (stmt.parsed.type === 'fileInclusion' ? flattenBlock(stmt.parsed.content) : [stmt]))
    .flat()
}
