import { Token } from '../../shared/parsed'
import { matchStr } from '../../shared/utils'
import { err, ScopeEntity, success, Typechecker, TypecheckerContext, TypecheckerResult } from '../base'

export const ensureScopeUnicity: Typechecker<Token<string>, void> = (name, { scopes }) => {
  const orig = scopes[scopes.length - 1].get(name.parsed)

  return orig
    ? err(name.at, {
        message: `a ${getEntityCategoryName(orig.type)} with this name was previously declared in this scope`,
        also: [
          {
            at: orig.at,
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
      return entity.type === category
        ? success(entity as Extract<ScopeEntity, { type: C }>)
        : err(
            name.at,
            `expected a ${getEntityCategoryName(category)} but found a ${getEntityCategoryName(entity.type)}`
          )
    }
  }

  return err(name.at, getEntityCategoryName(category) + ' not found')
}

export const getTypeAliasInScope: Typechecker<Token<string>, Extract<ScopeEntity, { type: 'typeAlias' }>> = (
  name,
  { scopes }
) => {
  for (let s = scopes.length - 1; s >= 0; s--) {
    const entity = scopes[s].get(name.parsed)

    if (entity) {
      return entity.type === 'typeAlias'
        ? success(entity)
        : err(name.at, 'expected a type name, found a ' + getEntityCategoryName(entity.type))
    }
  }

  return err(name.at, 'type not found')
}

export const getFunctionInScope: Typechecker<Token<string>, Extract<ScopeEntity, { type: 'fn' }>> = (
  name,
  { scopes }
) => {
  for (let s = scopes.length - 1; s >= 0; s--) {
    const entity = scopes[s].get(name.parsed)

    if (entity) {
      return entity.type === 'fn'
        ? success(entity)
        : err(name.at, 'expected a function, found a ' + getEntityCategoryName(entity.type))
    }
  }

  return err(name.at, 'function not found')
}

export const getVariableInScope: Typechecker<Token<string>, Extract<ScopeEntity, { type: 'var' }>> = (
  name,
  { scopes }
) => {
  for (let s = scopes.length - 1; s >= 0; s--) {
    const entity = scopes[s].get(name.parsed)

    if (entity) {
      return entity.type === 'var'
        ? success(entity)
        : err(name.at, 'expected a variable, found a ' + getEntityCategoryName(entity.type))
    }
  }

  return err(name.at, 'variable not found')
}

export function getEntityCategoryName(type: ScopeEntity['type']): string {
  return matchStr(type, {
    typeAlias: () => 'type alias',
    generic: () => 'generic',
    fn: () => 'function',
    var: () => 'variable',
  })
}
