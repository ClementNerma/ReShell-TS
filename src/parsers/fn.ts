import { FnArg, FnType, Token } from '../shared/parsed'
import { Parser } from './lib/base'
import { combine } from './lib/combinations'
import { extract, maybe } from './lib/conditions'
import { contextualFailure, failure } from './lib/errors'
import { maybe_s, maybe_s_nl, s } from './lib/littles'
import { takeWhile } from './lib/loops'
import { exact } from './lib/matchers'
import { map } from './lib/transform'
import { flattenMaybeToken, getErrorInput, withLatelyDeclared } from './lib/utils'
import { literalValue } from './literals'
import { identifier } from './tokens'
import { valueType } from './types'

const _fnRightPartParser: (requireName: boolean) => Parser<FnType> = (requireName) =>
  map(
    combine(
      map(combine(exact('fn'), s, requireName ? identifier : maybe(identifier)), ([_, __, name]) => name),
      combine(maybe_s, exact('(', "Expected an open paren '('"), maybe_s_nl),
      extract(
        takeWhile(
          map(
            combine(
              // maybe(map(combine(exact('mut'), s), ([_, mut]) => !!mut)),
              contextualFailure(identifier, (ctx) => !ctx.loopData!.firstIter, 'Expected an argument name'),
              map(
                combine(
                  maybe_s,
                  maybe(exact('?')),
                  exact(':', "Expected a semicolon (:) separator for the argument's type"),
                  maybe_s
                ),
                ([_, optional, __, ___]) => !!optional.parsed
              ),
              failure(
                withLatelyDeclared(() => valueType),
                'Expected a type for the argument'
              ),
              maybe(
                map(
                  combine(
                    combine(maybe_s_nl, exact('='), maybe_s_nl),
                    failure(
                      withLatelyDeclared(() => literalValue),
                      (err) => ({
                        message: 'Expected a literal value',
                        complements: [
                          [
                            'Tip',
                            getErrorInput(err).startsWith('"')
                              ? "Literal strings must be single-quoted (')"
                              : 'Lists, maps and structures are not literal values',
                          ],
                        ],
                      })
                    )
                  ),
                  ([_, { parsed: defaultValue }]) => defaultValue
                )
              )
            ),
            ([name, { parsed: optional }, { parsed: type }, { parsed: defaultValue }]): FnArg => ({
              name,
              optional,
              type,
              defaultValue,
            })
          ),
          {
            inter: combine(maybe_s_nl, exact(','), maybe_s_nl),
            interMatchingMakesExpectation: true,
          }
        )
      ),
      combine(maybe_s_nl, exact(')', "Expected a closing paren ')'")),
      maybe(
        map(
          combine(
            maybe_s,
            exact('->'),
            maybe_s,
            failure(
              withLatelyDeclared(() => valueType),
              'Expected a return type'
            )
          ),
          ([_, __, ___, returnType]) => returnType
        )
      ),
      maybe(
        map(
          combine(
            maybe_s,
            exact('throws'),
            s,
            failure(
              withLatelyDeclared(() => valueType),
              'Expected a failure type'
            )
          ),
          ([_, __, ___, failureType]) => failureType
        )
      )
    ),
    ([{ parsed: named }, _, { parsed: args }, __, { parsed: returnType }, { parsed: failureType }]) => ({
      named: flattenMaybeToken(named),
      args,
      returnType,
      failureType,
    })
  )

export const fnType: Parser<FnType> = _fnRightPartParser(false)
export const fnDecl: Parser<{ name: Token<string>; fnType: FnType }> = map(_fnRightPartParser(true), (fnType) => ({
  name: fnType.named!,
  fnType,
}))