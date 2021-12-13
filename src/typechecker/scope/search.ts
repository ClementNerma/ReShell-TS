import { ParserLoc } from '../../lib/base'
import { err, success, TypecheckerErr, TypecheckerRaw } from '../base'
import { Scope, ScopeFn, ScopeTypeAlias, ScopeVar } from './complete'
import { ScopeFirstPass } from './first-pass'

export const categoryMapping: { [key in keyof Scope]: string } = {
  typeAliases: 'type',
  functions: 'function',
  variables: 'variable',
}

export const ensureScopeUnicity: TypecheckerRaw<
  [string, ParserLoc],
  { scopes: Scope[]; firstPass?: ScopeFirstPass },
  void
> = ([name, loc], { scopes, firstPass }) => {
  if (firstPass) {
    for (const [category, map] of Object.entries(firstPass)) {
      const orig = map.get(name)
      if (orig) return generateDuplicateDeclError(name, categoryMapping[category as keyof Scope], loc, orig.loc)
    }
  }

  if (scopes.length > 0) {
    for (const [category, map] of Object.entries(scopes[scopes.length - 1])) {
      const orig = map.get(name)
      if (orig) return generateDuplicateDeclError(name, categoryMapping[category as keyof Scope], loc, orig.loc)
    }
  }

  return success(void 0)
}

export const getTypeAliasInScope: TypecheckerRaw<[string, ParserLoc], Scope[], ScopeTypeAlias> = (
  [name, loc],
  scopes
) => {
  for (let s = scopes.length - 1; s >= 0; s--) {
    const scopeType = scopes[s].typeAliases.get(name)
    if (scopeType) return success(scopeType)
  }

  return err({ message: 'Type not found in this scope', length: name.length }, loc)
}

export const getFunctionInScope: TypecheckerRaw<[string, ParserLoc], Scope[], ScopeFn> = ([name, loc], scopes) => {
  for (let s = scopes.length - 1; s >= 0; s--) {
    const scopeFn = scopes[s].functions.get(name)
    if (scopeFn) return success(scopeFn)
  }

  return err({ message: 'Function not found in this scope', length: name.length }, loc)
}

export const getVariableInScope: TypecheckerRaw<[string, ParserLoc], Scope[], ScopeVar> = ([name, loc], scopes) => {
  for (let s = scopes.length - 1; s >= 0; s--) {
    const scopeVar = scopes[s].variables.get(name)
    if (scopeVar) return success(scopeVar)
  }

  return err({ message: 'Variable not found in this scope', length: name.length }, loc)
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
        message: `A ${category} with this name was previously declared in this scope`,
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
