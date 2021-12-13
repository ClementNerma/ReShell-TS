import { Expr } from '../shared/ast'
import { CodeSection, Token } from '../shared/parsed'
import { err, success, Typechecker, TypecheckerContext, TypecheckerResult } from './base'
import { developTypeAliasesIn } from './types/aliases'
import { resolveExprType } from './types/expr'
import { rebuildType } from './types/rebuilder'

export function enumMatchingTypechecker<T, X>(
  subject: Token<Expr>,
  arms: Token<{ variant: Token<string>; matchWith: T }[]>,
  ctx: TypecheckerContext,
  armChecker: Typechecker<T, X>,
  inspect?: (mapped: X, matchWith: T) => void
): TypecheckerResult<void> {
  const matchOn = developTypeAliasesIn(resolveExprType(subject, { ...ctx, typeExpectation: null }), ctx)
  if (!matchOn.ok) return matchOn

  if (matchOn.data.type !== 'enum') {
    return err(
      subject.at,
      `matching can only be performed on enums, found \`${rebuildType(matchOn.data, { noDepth: true })}\``
    )
  }

  const toMatch = [...matchOn.data.variants]

  let usedFallback: CodeSection | false = false
  const usedVariants: Token<string>[] = []

  for (const { variant, matchWith } of arms.parsed) {
    const check = armChecker(matchWith, ctx)
    if (!check.ok) return check
    inspect?.(check.data, matchWith)

    if (variant.parsed === '_') {
      if (usedFallback !== false) {
        return err(variant.at, {
          message: 'cannot use the fallback pattern twice',
          also: [{ at: usedFallback, message: 'fallback pattern already used here' }],
        })
      }

      usedFallback = variant.at
      continue
    }

    const firstMatch = usedVariants.find((v) => v.parsed === variant.parsed)

    if (firstMatch) {
      return err(variant.at, {
        message: 'cannot match the same variant twice',
        also: [{ at: firstMatch.at, message: 'matched here previously' }],
      })
    }

    const relevant = toMatch.findIndex((v) => v.parsed === variant.parsed)

    if (relevant === -1) {
      return err(variant.at, {
        message: `unknown variant \`${variant.parsed}\``,
        complements: [['valid variants', matchOn.data.variants.map((v) => v.parsed).join(', ')]],
      })
    }

    usedVariants.push(variant)

    toMatch.splice(relevant, 1)
  }

  if (toMatch.length > 0 && usedFallback === false) {
    return err(subject.at, `missing arms for variants: ${toMatch.map((v) => v.parsed).join(', ')}`)
  }

  return success(void 0)
}
