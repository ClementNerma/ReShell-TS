import { Block } from '../shared/ast'
import { Runner, success } from './base'
import { runStatement } from './statement'

export const runBlock: Runner<Block> = (block, ctx) => {
  ctx = { ...ctx, scopes: ctx.scopes.concat([{ generics: [], entities: new Map() }]) }

  for (const stmt of block) {
    const result = runStatement(stmt, ctx)
    if (result.ok !== true) return result
  }

  return success(void 0)
}
