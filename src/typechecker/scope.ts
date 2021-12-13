// 1. Find all declared functions and type alias
// 2. Discover scope sequentially using the items above

import { FnType, StatementChain, ValueType } from '../parsers/data'
import { err, located, Located, success, TypecheckerArr } from './types'

export type ScopeFirstPass = {
  typeAliases: Map<string, Located<ValueType>>
  functions: Map<string, Located<FnType>>
}

export const scopeFirstPass: TypecheckerArr<StatementChain, void, ScopeFirstPass, string> = (chain) => {
  const scope: ScopeFirstPass = { typeAliases: new Map(), functions: new Map() }

  for (const stmt of chain) {
    if (stmt.parsed.type === 'empty') continue

    for (const sub of [stmt.parsed.start].concat(stmt.parsed.sequence.map((c) => c.parsed.chainedStatement))) {
      switch (sub.parsed.type) {
        case 'typeAlias':
          const typename = sub.parsed.typename.parsed

          if (scope.typeAliases.has(typename)) {
            return err('A type with this name was already declared in this scope', sub.parsed.typename.start)
          }

          scope.typeAliases.set(typename, located(sub.start, sub.parsed.content.parsed))
          break

        case 'fnDecl':
          const fnName = sub.parsed.name.parsed

          if (scope.functions.has(fnName)) {
            return err('A type with this name was already declared in this scope', sub.parsed.name.start)
          }

          scope.functions.set(fnName, located(sub.start, sub.parsed.fnType))
          break
      }
    }
  }

  return success(scope)
}
