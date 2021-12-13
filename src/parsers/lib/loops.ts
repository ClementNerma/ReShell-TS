import { CodeLoc, Token } from '../../shared/parsed'
import { err, ErrInputData, Parser, success, withErr, WithErrData } from './base'
import { then } from './conditions'

export type TakeWhileOptions = {
  inter?: Parser<unknown>
  interMatchingMakesExpectation?: true | WithErrData
  matchError?: WithErrData
  dontPropagateInterSkipping?: boolean
}

export function takeWhile<T>(parser: Parser<T>, options?: TakeWhileOptions): Parser<Token<T>[]> {
  return (start, input, context) => {
    const parsed: Token<T>[] = []
    const matched: string[] = []
    let interMadeExpectation = false
    let beforeInterMatching: CodeLoc | null = null

    let next = { ...start }

    while (true) {
      const result = parser(next, input, context)

      if (!result.ok) {
        if (interMadeExpectation || result.precedence) {
          return withErr(
            result,
            options?.matchError ??
              (options?.interMatchingMakesExpectation === true ? undefined : options?.interMatchingMakesExpectation)
          )
        }

        if (beforeInterMatching) {
          next = beforeInterMatching
          matched.pop()
        }

        break
      }

      const { data } = result

      input = input.offset(data.matched.length)
      next = data.at.next

      parsed.push(data)
      matched.push(data.matched)

      if (input.empty()) {
        break
      }

      if (/*!infos.skipInter &&*/ options?.inter) {
        const interResult = options.inter(next, input, context)

        if (!interResult.ok) {
          break
        }

        const { data: interData } = interResult

        beforeInterMatching = next
        input = input.offset(interData.matched.length)
        next = interData.at.next

        matched.push(interData.matched)

        if (options?.interMatchingMakesExpectation) {
          interMadeExpectation = true
        }
      }
    }

    return success(start, next, parsed, matched.join(''))
  }
}

export function takeWhile1<T>(
  parser: Parser<T>,
  options?: TakeWhileOptions & { noMatchError?: ErrInputData }
): Parser<Token<T>[]> {
  return then(takeWhile(parser, options), (_, parsed, context) =>
    parsed.parsed.length === 0
      ? err(parsed.at.start, parsed.at.next, context, options?.noMatchError)
      : { ok: true, data: parsed }
  )
}

export function takeWhileN<T>(
  parser: Parser<T>,
  options: TakeWhileOptions & { noMatchError?: ErrInputData; minimum: number }
): Parser<Token<T>[]> {
  return then(takeWhile(parser, options), (_, parsed, context) =>
    parsed.parsed.length < options.minimum
      ? err(parsed.at.start, parsed.at.next, context, options?.noMatchError)
      : { ok: true, data: parsed }
  )
}
