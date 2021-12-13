import {
  nativeLibraryFnTypes,
  nativeLibraryMethodsTypes,
  nativeLibraryTypeAliases,
  nativeLibraryVarTypes,
  _forgeToken,
} from '../../shared/native-lib'
import { PrecompData } from '../../shared/precomp'
import { Scope } from '../base'
import { resolveGenerics } from '../types/generics-resolver'

export function nativeLibraryTypeAliasesMap(): PrecompData['typeAliases'] {
  const typeAliases: PrecompData['typeAliases'] = new Map()

  for (const [name, { at, parsed }] of Object.entries(nativeLibraryTypeAliases)) {
    typeAliases.set(name, { at, content: parsed })
  }

  return typeAliases
}

export function nativeLibraryScope(): Scope {
  const nativeLib: Scope = { generics: new Map(), methods: [], entities: new Map() }

  for (const [name, fnType] of Object.entries(nativeLibraryFnTypes)) {
    nativeLib.entities.set(name, { type: 'fn', at: fnType.at, content: fnType.parsed })
  }

  for (const [name, variants] of Object.entries(nativeLibraryMethodsTypes)) {
    for (const fnType of variants) {
      if (fnType.parsed.method) {
        nativeLib.methods.push({
          at: fnType.at,
          name: _forgeToken(name),
          fnType: fnType.parsed,
          infos: fnType.parsed.method,
          forTypeWithoutGenerics: resolveGenerics(fnType.parsed.method.forType.parsed, 'unknown'),
        })
      }
    }
  }

  for (const [name, type] of Object.entries(nativeLibraryVarTypes)) {
    nativeLib.entities.set(name, { type: 'var', at: type.at, mutable: false, varType: type.parsed })
  }

  return nativeLib
}
