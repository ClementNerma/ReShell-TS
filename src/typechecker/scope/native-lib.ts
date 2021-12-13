import { CodeSection } from '../../shared/parsed'
import { Scope } from '../base'

export function nativeLibraryScope(): Scope {
  const nativeLib: Scope = new Map()

  nativeLib.set('argv', {
    type: 'var',
    at: nativeLibAt,
    mutable: false,
    varType: { type: 'list', itemsType: { type: 'unknown' } }
  })

  return nativeLib
}

const nativeLibAt: CodeSection = {
  start: {
    file: { type: 'internal', path: 'native library' },
    col: 0,
    line: 0
  },
  next: {
    file: { type: 'internal', path: 'native library' },
    col: 0,
    line: 0
  }
}