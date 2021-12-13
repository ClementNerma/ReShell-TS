import { Scope } from '../base'

export function nativeLibraryScope(): Scope {
  const typeAliases: Scope['typeAliases'] = new Map()
  const functions: Scope['functions'] = new Map()
  const variables: Scope['variables'] = new Map()

  return { typeAliases, functions, variables }
}
