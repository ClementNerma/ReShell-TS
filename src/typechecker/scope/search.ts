import { Token } from '../../shared/parsed'
import { err, Located, Scope, ScopeFn, ScopeTypeAlias, ScopeVar, success, Typechecker, TypecheckerErr } from '../base'

export const categoryMapping: { [key in keyof Scope]: string } = {
  typeAliases: 'type',
  functions: 'function',
  variables: 'variable',
}

export const ensureScopeUnicity: Typechecker<Token<string>, void> = (name, { scopes }) => {
  for (const [category, map] of Object.entries(scopes[scopes.length - 1])) {
    const orig = map.get(name.parsed)
    if (orig) return generateDuplicateDeclError(orig, categoryMapping[category as keyof Scope], name)
  }

  return success(void 0)
}

export const getTypeAliasInScope: Typechecker<Token<string>, ScopeTypeAlias> = (name, { scopes }) => {
  for (let s = scopes.length - 1; s >= 0; s--) {
    const scopeType = scopes[s].typeAliases.get(name.parsed)
    if (scopeType) return success(scopeType)
  }

  return err(name.at, 'Type not found in this scope')
}

export const getFunctionInScope: Typechecker<Token<string>, ScopeFn> = (name, { scopes }) => {
  for (let s = scopes.length - 1; s >= 0; s--) {
    const scopeFn = scopes[s].functions.get(name.parsed)
    if (scopeFn) return success(scopeFn)
  }

  return err(name.at, 'Function not found in this scope')
}

export const getVariableInScope: Typechecker<Token<string>, ScopeVar> = (name, { scopes }) => {
  for (let s = scopes.length - 1; s >= 0; s--) {
    const scopeVar = scopes[s].variables.get(name.parsed)
    if (scopeVar) return success(scopeVar)
  }

  return err(name.at, 'Variable not found in this scope')
}

export const generateDuplicateDeclError = (
  original: Located<unknown>,
  category: string,
  duplicate: Token<string>
): TypecheckerErr =>
  err(duplicate.at, {
    message: `A ${category} with this name was previously declared in this scope`,
    also: [
      {
        at: original.at,
        message: 'Original declaration occurs here',
      },
    ],
  })
