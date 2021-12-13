import { ValueType } from '../../shared/ast'
import { isLocEq } from '../../shared/loc-cmp'
import { CodeLoc, Token } from '../../shared/parsed'
import { matchStrWithValues } from '../../shared/utils'
import {
  err,
  GenericResolutionScope,
  ScopeEntity,
  success,
  Typechecker,
  TypecheckerContext,
  TypecheckerResult,
} from '../base'

export const ensureScopeUnicity: Typechecker<Token<string>, void> = (name, { scopes }) => {
  const orig = scopes[scopes.length - 1].entities.get(name.parsed)

  return orig
    ? err(name.at, {
        message: `a ${getEntityCategoryName(orig.type)} with this name was previously declared in this scope`,
        also: [{ at: orig.at, message: 'original declaration occurs here' }],
      })
    : success(void 0)
}

export const getEntityInScope: Typechecker<Token<string>, ScopeEntity> = (name, { scopes }) => {
  for (let s = scopes.length - 1; s >= 0; s--) {
    const entity = scopes[s].entities.get(name.parsed)
    if (entity) return success(entity)
  }

  return err(name.at, 'entity not found')
}

export function getTypedEntityInScope<C extends ScopeEntity['type']>(
  name: Token<string>,
  category: C,
  { scopes }: TypecheckerContext
): TypecheckerResult<Extract<ScopeEntity, { type: C }>> {
  for (let s = scopes.length - 1; s >= 0; s--) {
    const entity = scopes[s].entities.get(name.parsed)

    if (entity) {
      if (entity.type !== category) {
        return err(
          name.at,
          `expected a ${getEntityCategoryName(category)}, found a ${getEntityCategoryName(entity.type)}`
        )
      } else {
        return success(entity as Extract<ScopeEntity, { type: C }>)
      }
    }
  }

  return err(name.at, getEntityCategoryName(category) + ' not found')
}

export function getEntityCategoryName(type: ScopeEntity['type']): string {
  return matchStrWithValues(type, { fn: 'function', var: 'variable' })
}

export function getContextuallyResolvedGeneric(
  resolvedGenerics: TypecheckerContext['resolvedGenerics'],
  inFnCallAt: CodeLoc,
  generic: Extract<ValueType, { type: 'generic' }>
): { mapped: ValueType | null } | undefined {
  for (let s = resolvedGenerics.length - 1; s >= 0; s--) {
    const got = getResolvedGenericInSingleScope(resolvedGenerics[s], inFnCallAt, generic)
    if (got) return got
  }

  return undefined
}

export function getResolvedGenericInSingleScope(
  gScope: GenericResolutionScope,
  inFnCallAt: CodeLoc,
  { name, orig }: Extract<ValueType, { type: 'generic' }>
): { mapped: ValueType | null } | undefined {
  return gScope.find(
    (c) => c.name.parsed === name.parsed && isLocEq(orig.start, c.orig.start) && isLocEq(inFnCallAt, c.inFnCallAt)
  )
}
