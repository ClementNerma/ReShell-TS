import { CodeLoc, Token } from '../../shared/parsed'
import { err, ErrInputData, Parser, ParsingContext, sliceInput, success, withErr, WithErrData } from './base'
import { then } from './conditions'

export type TakeWhileOptions = {
  inter?: Parser<unknown>
  interMatchingMakesExpectation?: boolean
  matchError?: WithErrData
}

export function takeWhile<T>(parser: Parser<T>, options?: TakeWhileOptions): Parser<Token<T>[]> {
  return (start, input, context) => {
    const parsed: Token<T>[] = []
    const matched: string[] = []
    let interMadeExpectation = false
    let beforeInterMatching: CodeLoc | null = null
    let lastWasNeutralError = false

    let next = { ...start }
    let iter = 0

    while (true) {
      const iterContext: ParsingContext = {
        ...context,
        loopData: {
          firstIter: iter === 0,
          iter: iter++,
          lastWasNeutralError,
          soFar: { previous: parsed[parsed.length - 1] ?? null, start, matched, parsed },
        },
      }

      const result = parser(next, input, iterContext)

      if (!result.ok) {
        if (interMadeExpectation || result.precedence) {
          return withErr(result, context, options?.matchError)
        }

        if (beforeInterMatching) {
          next = beforeInterMatching
          matched.pop()
        }

        break
      }

      const { data } = result

      lastWasNeutralError = data.neutralError

      input = sliceInput(input, next, data.at.next)
      next = data.at.next

      parsed.push(data)
      matched.push(data.matched)

      if (input.length === 0) {
        break
      }

      if (options?.inter) {
        const interResult = options.inter(next, input, iterContext)

        if (!interResult.ok) {
          if (data.neutralError) {
            continue
          } else {
            return success(start, next, parsed, matched.join(''))
          }
        }

        const { data: interData } = interResult

        beforeInterMatching = next
        input = sliceInput(input, next, interData.at.next)
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
  return then(takeWhile(parser, options), (parsed, context) =>
    parsed.data.parsed.length === 0
      ? err(parsed.data.at.start, parsed.data.at.next, context, options?.noMatchError)
      : parsed
  )
}

export function takeWhileN<T>(
  parser: Parser<T>,
  options: TakeWhileOptions & { noMatchError?: ErrInputData; minimum: number }
): Parser<Token<T>[]> {
  return then(takeWhile(parser, options), (parsed, context) =>
    parsed.data.parsed.length < options.minimum
      ? err(parsed.data.at.start, parsed.data.at.next, context, options?.noMatchError)
      : parsed
  )
}
