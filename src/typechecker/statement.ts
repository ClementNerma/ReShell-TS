import { StatementChain } from '../shared/parsed'
import { success, TypecheckerArr } from './base'
import { completeScope, Scope } from './scope/complete'
import { scopeFirstPass } from './scope/first-pass'

export const statementChainChecker: TypecheckerArr<StatementChain, Scope[], void> = (chain, parents) => {
  const firstPass = scopeFirstPass(chain, parents)
  if (!firstPass.ok) return firstPass

  const scope = completeScope(chain, { parents, firstPass: firstPass.data })
  if (!scope.ok) return scope

  return success(void 0)
}
