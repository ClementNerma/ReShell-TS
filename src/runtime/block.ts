import { Block, Statement } from '../shared/ast'
import { Token } from '../shared/parsed'
import { Runner, Scope, success } from './base'
import { runStatement } from './statement'

export const runBlock: Runner<Block> = (block, ctx) => {
  const blockScope: Scope = { generics: [], methods: [], entities: new Map() }

  ctx = { ...ctx, scopes: ctx.scopes.concat([blockScope]) }

  // Flatten blocks to avoid having a sub-scope for included files
  const flattened = flattenBlock(block)

  // Register functions and methods first, so they can be used before their
  // declaration statement is reached.
  for (const { parsed: stmt } of flattened) {
    if (stmt.type === 'fnDecl') {
      blockScope.entities.set(stmt.name.parsed, {
        type: 'fn',
        body: { type: 'block', body: stmt.body },
        fnType: stmt.fnType,
        argsMapping: null,
      })
    } else if (stmt.type === 'methodDecl') {
      blockScope.methods.push({ infos: stmt.infos, body: stmt.body })
    }
  }

  // Treat all statements in order
  for (const stmt of flattened) {
    const result = runStatement(stmt, ctx)
    if (result.ok !== true) return result
  }

  return success(void 0)
}

/**
 * Flatten file inclusions to make them use the same scope as the caller block
 */
function flattenBlock(block: Block): Token<Statement>[] {
  return block.map((stmt) => (stmt.parsed.type === 'fileInclusion' ? flattenBlock(stmt.parsed.content) : [stmt])).flat()
}
