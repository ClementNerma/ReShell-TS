import { Token } from '../../shared/parsed'
import { err, Located, Scope, ScopeFn, ScopeTypeAlias, ScopeVar, success, Typechecker, TypecheckerErr } from '../base'
import { ScopeFirstPass } from './first-pass'

export const categoryMapping: { [key in keyof Scope]: string } = {
  typeAliases: 'type',
  functions: 'function',
  variables: 'variable',
}

export const ensureScopeUnicity: Typechecker<{ name: Token<string>; firstPass?: ScopeFirstPass }, void> = (
  { name, firstPass },
  { scopes }
) => {
  if (firstPass) {
    for (const [category, map] of Object.entries(firstPass)) {
      const orig = map.get(name.parsed)
      if (orig) return generateDuplicateDeclError(orig, categoryMapping[category as keyof Scope], name)
    }
  }

  if (scopes.length > 0) {
    for (const [category, map] of Object.entries(scopes[scopes.length - 1])) {
      const orig = map.get(name.parsed)
      if (orig) return generateDuplicateDeclError(orig, categoryMapping[category as keyof Scope], name)
    }
  }

  return success(void 0)
}

export const getTypeAliasInScope: Typechecker<Token<string>, ScopeTypeAlias> = (name, { scopes }) => {
  for (let s = scopes.length - 1; s >= 0; s--) {
    const scopeType = scopes[s].typeAliases.get(name.parsed)
    if (scopeType) return success(scopeType)
  }

  return err({ message: 'Type not found in this scope' }, name)
}

export const getFunctionInScope: Typechecker<Token<string>, ScopeFn> = (name, { scopes }) => {
  for (let s = scopes.length - 1; s >= 0; s--) {
    const scopeFn = scopes[s].functions.get(name.parsed)
    if (scopeFn) return success(scopeFn)
  }

  return err({ message: 'Function not found in this scope' }, name)
}

export const getVariableInScope: Typechecker<Token<string>, ScopeVar> = (name, { scopes }) => {
  for (let s = scopes.length - 1; s >= 0; s--) {
    const scopeVar = scopes[s].variables.get(name.parsed)
    if (scopeVar) return success(scopeVar)
  }

  return err({ message: 'Variable not found in this scope' }, name)
}

export const generateDuplicateDeclError = (
  original: Located<unknown>,
  category: string,
  duplicate: Token<string>
): TypecheckerErr =>
  err(
    {
      error: `A ${category} with this name was previously declared in this scope`,
      also: [
        {
          start: original.start,
          end: original.end,
          message: 'Original declaration occurs here',
          complements: [],
        },
      ],
    },
    duplicate
  )
