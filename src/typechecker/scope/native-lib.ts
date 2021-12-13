import { nativeLibraryFnTypes, nativeLibraryTypeAliases, nativeLibraryVarTypes } from '../../shared/native-lib'
import { PrecompData } from '../../shared/precomp'
import { Scope } from '../base'

export function nativeLibraryTypeAliasesMap(): PrecompData['typeAliases'] {
  const typeAliases: PrecompData['typeAliases'] = new Map()

  for (const [name, { at, parsed }] of Object.entries(nativeLibraryTypeAliases)) {
    typeAliases.set(name, { at, content: parsed })
  }

  return typeAliases
}

export function nativeLibraryScope(): Scope {
  const nativeLib: Scope = new Map()

  for (const [name, fnType] of Object.entries(nativeLibraryFnTypes)) {
    nativeLib.set(name, { type: 'fn', at: fnType.at, content: fnType.parsed })
  }

  for (const [name, type] of Object.entries(nativeLibraryVarTypes)) {
    nativeLib.set(name, { type: 'var', at: type.at, mutable: false, varType: type.parsed })
  }

  return nativeLib
}
