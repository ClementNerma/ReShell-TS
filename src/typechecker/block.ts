import { Block } from '../shared/ast'
import { diagnostic, DiagnosticLevel } from '../shared/diagnostics'
import { CodeSection } from '../shared/parsed'
import { Scope, success, Typechecker } from './base'
import { flattenBlock, scopeFirstPass } from './scope/first-pass'
import { statementChecker, StatementMetadata } from './statement'

export type StatementChainMetadata = {
  neverEnds: boolean
  topLevelScope: Scope
}

export const blockChecker: Typechecker<Block, StatementChainMetadata> = (chain, ctx) => {
  const firstPass = scopeFirstPass(chain, ctx)
  if (!firstPass.ok) return firstPass

  // 1. Find all declared functions and type alias
  // 2. Discover scope sequentially using the items above

  const currentScope = firstPass.data
  ctx = { ...ctx, scopes: ctx.scopes.concat(currentScope) }

  let previousStmt: { at: CodeSection; metadata: StatementMetadata } | null = null

  for (const stmt of flattenBlock(chain)) {
    if (previousStmt?.metadata.neverEnds === true) {
      ctx.emitDiagnostic(
        diagnostic(
          stmt.at,
          {
            message: 'previous statement always returns (or break loop), so this is dead code',
            also: [
              {
                at: previousStmt.at,
                message: 'caused by the fact this statement always returns or break loop',
              },
            ],
          },
          DiagnosticLevel.Warning
        )
      )
    }

    const stmtMetadata = statementChecker(stmt, ctx)

    if (!stmtMetadata.ok) return stmtMetadata

    previousStmt = { at: stmt.at, metadata: stmtMetadata.data }
  }

  const metadata: StatementMetadata = previousStmt?.metadata ?? { neverEnds: false }

  return success({ ...metadata, topLevelScope: currentScope })
}
