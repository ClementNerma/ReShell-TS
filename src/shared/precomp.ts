import { FnType, Value, ValueType } from './ast'
import { CodeSection } from './parsed'

export type PrecompData = {
  typeAliases: Map<string, { at: CodeSection; content: ValueType }>
  callbackTypes: Map<Value, FnType>
  fnCallGenerics: Map<CodeSection, Map<string, ValueType>>
}
