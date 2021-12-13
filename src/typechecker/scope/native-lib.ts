import {
  nativeLibAt,
  nativeLibraryFnTypes,
  nativeLibraryTypeAliases,
  nativeLibraryVarTypes,
} from '../../shared/native-lib'
import { PrecompData } from '../../shared/precomp'
import { Scope } from '../base'

export function nativeLibraryScope(): Scope {
  const nativeLib: Scope = new Map()

  for (const [name, fnType] of nativeLibraryFnTypes) {
    nativeLib.set(name, { type: 'fn', at: nativeLibAt, content: fnType })
  }

  for (const [name, type] of nativeLibraryVarTypes) {
    nativeLib.set(name, { type: 'var', at: nativeLibAt, mutable: false, varType: type })
  }

  return nativeLib
}

export function nativeLibraryTypeAliasesMap(): PrecompData['typeAliases'] {
  const typeAliases: PrecompData['typeAliases'] = new Map()

  for (const [name, content] of nativeLibraryTypeAliases) {
    typeAliases.set(name, { at: nativeLibAt, content })
  }

  return typeAliases
}
