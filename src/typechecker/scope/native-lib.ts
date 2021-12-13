import { Scope } from '../base'

export function nativeLibraryScope(): Scope {
  return {
    typeAliases: new Map([]),
    functions: new Map([]),
    variables: new Map([]),
  }
}
