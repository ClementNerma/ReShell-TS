import { Block, Statement } from '../shared/ast'
import { Token } from '../shared/parsed'
import { Runner, success } from './base'
import { runStatement } from './statement'

export const runBlock: Runner<Block> = (block, ctx) => {
  ctx = { ...ctx, scopes: ctx.scopes.concat([{ generics: [], entities: new Map() }]) }

  for (const stmt of flattenBlock(block)) {
    const result = runStatement(stmt, ctx)
    if (result.ok !== true) return result
  }

  return success(void 0)
}

function flattenBlock(block: Block): Token<Statement>[] {
  return block.map((stmt) => (stmt.parsed.type === 'fileInclusion' ? flattenBlock(stmt.parsed.content) : [stmt])).flat()
}
