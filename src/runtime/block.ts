import { Block, Statement } from '../shared/ast'
import { Token } from '../shared/parsed'
import { Runner, success } from './base'
import { runStatement } from './statement'

export const runBlock: Runner<Block> = (block, ctx) => {
  ctx = { ...ctx, scopes: ctx.scopes.concat([{ generics: [], entities: new Map() }]) }

  const flattened = flattenBlock(block)

  for (const { parsed: stmt } of flattened) {
    if (stmt.type === 'fnDecl') {
      const scope = ctx.scopes[ctx.scopes.length - 1]
      scope.entities.set(stmt.name.parsed, { type: 'fn', body: stmt.body })
    } else if (stmt.type === 'methodDecl') {
      ctx.methods.push({ infos: stmt.infos, body: stmt.body })
    }
  }

  for (const stmt of flattened) {
    const result = runStatement(stmt, ctx)
    if (result.ok !== true) return result
  }

  return success(void 0)
}

function flattenBlock(block: Block): Token<Statement>[] {
  return block.map((stmt) => (stmt.parsed.type === 'fileInclusion' ? flattenBlock(stmt.parsed.content) : [stmt])).flat()
}
