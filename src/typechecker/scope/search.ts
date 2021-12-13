import { ParserLoc } from '../../lib/base'
import { err, success, TypecheckerErr, TypecheckerRaw } from '../base'
import { Scope } from './complete'
import { ScopeFirstPass } from './first-pass'

export const ensureScopeUnicity: TypecheckerRaw<
  [string, ParserLoc],
  { scopes: Scope[]; firstPass?: ScopeFirstPass },
  void
> = ([name, loc], { scopes, firstPass }) => {
  if (firstPass) {
    for (const [category, map] of Object.entries(firstPass)) {
      const orig = map.get(name)
      if (orig) return generateDuplicateDeclError(name, category, loc, orig.loc)
    }
  }

  for (const [category, map] of Object.entries(scopes[scopes.length - 1])) {
    const orig = map.get(name)
    if (orig) return generateDuplicateDeclError(name, category, loc, orig.loc)
  }

  return success(void 0)
}

export const generateDuplicateDeclError = (
  name: string,
  category: string,
  duplicateLoc: ParserLoc,
  originalLoc: ParserLoc
): TypecheckerErr =>
  err(
    {
      error: {
        message: `A ${category} with this name was already declared in this scope`,
        length: name.length,
      },
      also: [
        {
          loc: originalLoc,
          length: name.length,
          message: 'Original declaration occurs here',
          complements: [],
        },
      ],
    },
    duplicateLoc
  )
