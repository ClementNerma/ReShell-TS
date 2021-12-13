import { CodeSection, Token } from '../shared/parsed'
import { Parser } from './lib/base'
import { combine } from './lib/combinations'
import { FailableMapped } from './lib/conditions'
import { fail, lookahead } from './lib/consumeless'
import { withRuntimeTypedCtx, withTypedCtx } from './lib/context'
import { maybe_s_nl } from './lib/littles'
import { exact } from './lib/matchers'
import { or } from './lib/switches'

export type StatementClosingChar = '}' | ']' | ')'

type CtxAction<T> = ($custom: CustomContext) => Parser<T>

export type CustomContext = {
  statementClose: StatementClosingChar | null
  continuationKeywords: string[]
  genericsDefinitions: Map<string, CodeSection>[]
  inTypeAliasDefinition: boolean
}

export const initContext: () => CustomContext = () => ({
  statementClose: null,
  continuationKeywords: [],
  genericsDefinitions: [],
  inTypeAliasDefinition: false,
})

export const mapContextProp = <P extends keyof CustomContext>(
  context: CustomContext,
  prop: P,
  mapper: (value: CustomContext[P]) => CustomContext[P]
): CustomContext => ({ ...context, [prop]: mapper(context[prop]) })

export const addGenericsDefinition = (context: CustomContext, generics: Token<string>[]): CustomContext =>
  generics.length === 0
    ? context
    : mapContextProp(context, 'genericsDefinitions', (def) =>
        def.concat([new Map(generics.map((g) => [g.parsed, g.at]))])
      )

export const completeGenericsDefinition = (
  name: Token<string>,
  context: CustomContext
): FailableMapped<{ name: Token<string>; orig: CodeSection }> => {
  for (let i = context.genericsDefinitions.length - 1; i >= 0; i--) {
    const orig = context.genericsDefinitions[i].get(name.parsed)
    if (orig) return { ok: true, data: { name, orig } }
  }

  return { ok: false, err: "internal error: generic not found in parser's hierarchiesed definitions in" }
}

export const withStatementClosingChar = <T>(statementClose: StatementClosingChar, parser: Parser<T>): Parser<T> =>
  withTypedCtx<T, CustomContext>(($custom) => ({ ...$custom, statementClose }), parser)

export const withContinuationKeyword = <T>(continuationKeywords: string[], parser: Parser<T>): Parser<T> =>
  withTypedCtx<T, CustomContext>(
    ($custom) => ({
      ...$custom,
      continuationKeywords,
    }),
    parser
  )

export const withinTypeAliasDefinition = <T>(parser: Parser<T>): Parser<T> =>
  withTypedCtx<T, CustomContext>(($custom) => ({ ...$custom, inTypeAliasDefinition: true }), parser)

export const getStatementClose: <T>(action: (char: string | null) => Parser<T>) => CtxAction<T> =
  (action) => ($custom) =>
    action($custom.statementClose)

export const getContinuationKeyword: <T>(action: (words: string[]) => Parser<T>) => CtxAction<T> =
  (action) => ($custom) =>
    action($custom.continuationKeywords)

export const matchStatementClose = withRuntimeTypedCtx(
  getStatementClose((char) => (char !== null ? lookahead(combine(maybe_s_nl, exact(char))) : fail()))
)

export const matchContinuationKeyword = withRuntimeTypedCtx(
  getContinuationKeyword((keywords) =>
    keywords.length > 0 ? lookahead(combine(maybe_s_nl, or(keywords.map((keyword) => exact(keyword))))) : fail()
  )
)
