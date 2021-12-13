import { Block } from '../shared/ast'
import { matchStr } from '../shared/utils'
import { Runner, success } from './base'
import { runStatement } from './statement'

export const runBlock: Runner<Block> = (block, ctx) => {
  ctx = { ...ctx, scopes: ctx.scopes.concat([{ generics: [], entities: new Map() }]) }

  for (const { parsed: chain } of block) {
    if (chain.type === 'empty') continue

    let result = runStatement(chain.start, ctx)

    for (const { parsed: chained } of chain.sequence) {
      result = matchStr(chained.op.parsed, {
        And: () => (result.ok === true ? runStatement(chained.chainedStatement, ctx) : result),
        Or: () => (result.ok === true ? success(void 0) : runStatement(chained.chainedStatement, ctx)),
        Then: () => runStatement(chained.chainedStatement, ctx),
      })

      if (result.ok === null) return result
    }

    if (result.ok !== true) return result
  }

  return success(void 0)
}
