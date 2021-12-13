import { CmdDeclSubCommand } from '../shared/ast'
import { matchUnion } from '../shared/utils'
import { success, Typechecker, TypecheckerResult } from './base'
import { fnTypeArgsValidator } from './types/fn'

export const cmdDeclSubCommandTypechecker: Typechecker<CmdDeclSubCommand, void> = ({ base, variants }, ctx) => {
  for (const variant of (base ? [base] : []).concat(variants)) {
    const check: TypecheckerResult<unknown> = matchUnion(variant.parsed.signature, 'type', {
      direct: ({ args }) => fnTypeArgsValidator(args, ctx),
      subCmd: ({ content }) => cmdDeclSubCommandTypechecker(content, ctx),
    })

    if (!check.ok) return check
  }

  return success(void 0)
}
