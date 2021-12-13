import { ValueType } from '../../shared/ast'
import { isLocEq } from '../../shared/loc-cmp'
import { CodeSection, Token } from '../../shared/parsed'
import { ensureCoverage, GenericResolutionScope } from '../base'
import { getContextuallyResolvedGeneric } from '../scope/search'

/**
 * This function is highly techincal and unfortunately very complex as it is
 * Its role is to resolve the generics inside a type, so for instance with the type "[:T]" is will look for the resolved ":T"
 *   generic in the typechecking's context (let's say it's "string") and resolve the type as "[string]"
 * Where the complexity comes is that a generic's definition can contain another generic, e.g. in the case where a function with generics
 *   calls another function with generics. This case requires to resolve again the generics, and this can happen an infinite number of times.
 * This requires to try to resolve generics until the resolution doesn't change anything to the type we got. This is performed by detecting
 *   the list of resolved generics in a type during its resolution. It that list is not empty, we resolve it again as a generic might hide another.
 * Note that a generic which doesn't have a definition or which is defined as itself is not counted during the resolution, as the list's purpose
 *   is to indicate what has *changed* during the resolution.
 * We try this until there is no longer any generic resolved in the type, indicating the resolution is complete. We can the return it to the caller.
 */
export function resolveGenerics(type: ValueType, gScopes: GenericResolutionScope[]): ValueType {
  function _subroutine(
    type: ValueType,
    gScopes: GenericResolutionScope[]
  ): [ValueType, { name: Token<string>; orig: CodeSection }[]] {
    switch (type.type) {
      case 'bool':
      case 'number':
      case 'string':
      case 'path':
      case 'enum':
      case 'aliasRef':
      case 'unknown':
      case 'void':
        return [type, []]

      case 'list': {
        const [resolved, deps] = _subroutine(type.itemsType, gScopes)
        return [{ type: type.type, itemsType: resolved }, deps]
      }

      case 'map': {
        const [resolved, deps] = _subroutine(type.itemsType, gScopes)
        return [{ type: type.type, itemsType: resolved }, deps]
      }

      case 'struct': {
        const allDeps: { name: Token<string>; orig: CodeSection }[] = []

        return [
          {
            type: type.type,
            members: type.members.map(({ name, type }) => {
              const [resolved, deps] = _subroutine(type, gScopes)
              allDeps.push(...deps)
              return { name, type: resolved }
            }),
          },
          allDeps,
        ]
      }

      case 'fn': {
        const allDeps: { name: Token<string>; orig: CodeSection }[] = []

        let returnType: typeof type.fnType.returnType = null

        if (type.fnType.returnType) {
          const [resolved, deps] = _subroutine(type.fnType.returnType.parsed, gScopes)
          allDeps.push(...deps)
          returnType = { ...type.fnType.returnType, parsed: resolved }
        }

        return [
          {
            type: type.type,
            fnType: {
              generics: type.fnType.generics,
              args: type.fnType.args.map((arg) => {
                const [resolved, deps] = _subroutine(arg.parsed.type.parsed, gScopes)
                allDeps.push(...deps)

                return {
                  ...arg,
                  parsed: { ...arg.parsed, type: { ...arg.parsed.type, parsed: resolved } },
                }
              }),
              restArg: type.fnType.restArg,
              returnType,
            },
          },
          allDeps,
        ]
      }

      case 'nullable': {
        const [inner, deps] = _subroutine(type.inner, gScopes)
        return [{ type: type.type, inner }, deps]
      }

      case 'failable': {
        const [success, sdeps] = _subroutine(type.successType.parsed, gScopes)
        const [failure, fdeps] = _subroutine(type.failureType.parsed, gScopes)

        return [
          {
            type: 'failable',
            successType: { ...type.successType, parsed: success },
            failureType: { ...type.failureType, parsed: failure },
          },
          sdeps.concat(fdeps),
        ]
      }

      case 'generic': {
        const allDeps: { name: Token<string>; orig: CodeSection }[] = [{ name: type.name, orig: type.orig }]

        const previous = { ...type }
        type = getContextuallyResolvedGeneric(gScopes, type.name.parsed, type.orig)?.mapped ?? type

        if (!isResolvedGenericDifferent(type, previous)) {
          return [type, []]
        }

        for (;;) {
          const [resolved, deps] = _subroutine(type, gScopes)
          if (deps.length === 0) break
          allDeps.push(...deps)
          type = resolved
        }

        const seen: { name: Token<string>; orig: CodeSection }[] = []

        const dedupDeps = allDeps.filter(({ name, orig }) => {
          if (seen.find((entry) => entry.name === name && isLocEq(entry.orig.start, orig.start))) {
            return false
          }

          seen.push({ name, orig })
          return true
        })

        return [type, dedupDeps]
      }

      default:
        return ensureCoverage(type)
    }
  }

  return _subroutine(type, gScopes)[0]
}

/**
 * Check if a generic type changed after its resolution
 * Used to determine if another resolution is required
 */
export function isResolvedGenericDifferent(
  resolved: ValueType,
  original: Extract<ValueType, { type: 'generic' }>
): boolean {
  return (
    resolved.type !== 'generic' ||
    resolved.name.parsed !== original.name.parsed ||
    !isLocEq(resolved.name.at.start, original.name.at.start) ||
    !isLocEq(resolved.orig.start, original.orig.start)
  )
}
