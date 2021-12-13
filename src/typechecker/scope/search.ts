import { ValueType } from '../../shared/ast'
import { CodeSection, Token } from '../../shared/parsed'
import { matchStr } from '../../shared/utils'
import {
  err,
  GenericResolutionScope,
  ScopeEntity,
  success,
  Typechecker,
  TypecheckerContext,
  TypecheckerResult,
} from '../base'
import { isLocEq } from '../loc-cmp'

export const ensureScopeUnicity: Typechecker<Token<string>, void> = (name, { scopes }) => {
  const orig = scopes[scopes.length - 1].get(name.parsed)

  return orig
    ? err(name.at, {
        message: `a ${getEntityCategoryName(orig.type)} with this name was previously declared in this scope`,
        also: [
          {
            at: orig.type === 'generic' ? orig.name.at : orig.at,
            message: 'original declaration occurs here',
          },
        ],
      })
    : success(void 0)
}

export const getEntityInScope: Typechecker<Token<string>, ScopeEntity> = (name, { scopes }) => {
  for (let s = scopes.length - 1; s >= 0; s--) {
    const entity = scopes[s].get(name.parsed)
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
    const entity = scopes[s].get(name.parsed)

    if (entity) {
      if (entity.type !== category) {
        if ((entity.type === 'var' || entity.type === 'fn') && (category === 'var' || category === 'fn')) {
          return err(
            name.at,
            `expected a ${getEntityCategoryName(category)}, found a ${getEntityCategoryName(entity.type)}`
          )
        }
      } else {
        return success(entity as Extract<ScopeEntity, { type: C }>)
      }
    }
  }

  return err(name.at, getEntityCategoryName(category) + ' not found')
}

export function getEntityCategoryName(type: ScopeEntity['type']): string {
  return matchStr(type, {
    generic: () => 'generic',
    fn: () => 'function',
    var: () => 'variable',
  })
}

export function getContextuallyResolvedGeneric(
  resolvedGenerics: TypecheckerContext['resolvedGenerics'],
  name: string,
  orig: CodeSection
): { mapped: ValueType | null } | undefined {
  for (const gScope of resolvedGenerics.reverse()) {
    const got = getResolvedGenericInSingleScope(gScope, name, orig)
    if (got) return got
  }

  return undefined
}

export function getResolvedGenericInSingleScope(
  gScope: GenericResolutionScope,
  name: string,
  orig: CodeSection
): { mapped: ValueType | null } | undefined {
  return gScope.find((c) => c.name.parsed === name && isLocEq(orig.start, c.orig.start))
}
