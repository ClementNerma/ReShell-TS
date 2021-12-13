import { ValueType } from '../../shared/ast'
import { isLocEq } from '../../shared/loc-cmp'
import { Token } from '../../shared/parsed'
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
  gScope: GenericResolutionScope,
  { name, orig, fromFnCallAt }: Extract<ValueType, { type: 'generic' }>,
  max?: number
): { mapped: ValueType | null } | undefined {
  return (
    gScope
      .slice()
      .reverse()
      .find(
        (c) =>
          c.name.parsed === name.parsed &&
          isLocEq(orig.start, c.orig.start) &&
          fromFnCallAt !== null &&
          isLocEq(fromFnCallAt, c.inFnCallAt)
      ) ??
    (fromFnCallAt !== null
      ? undefined
      : gScope
          .slice(0, max ?? gScope.length)
          .reverse()
          .find((c) => c.name.parsed === name.parsed && isLocEq(orig.start, c.orig.start)))
  )
}
