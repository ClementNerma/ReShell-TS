import { err, ErrorMapping, Parser, ParserLoc, sliceInput, success, Token, withErr } from './base'
import { then } from './conditions'

export type TakeWhileOptions = {
  inter?: Parser<unknown>
  interMatchingMakesExpectation?: boolean
  matchError?: ErrorMapping
}

export function takeWhile<T>(parser: Parser<T>, options?: TakeWhileOptions): Parser<Token<T>[]> {
  return (start, input, context) => {
    const parsed: Token<T>[] = []
    const matched: string[] = []
    let interMadeExpectation = false
    let beforeInterMatching: ParserLoc | null = null

    let loc = { ...start }
    let iter = 0

    while (true) {
      const iterContext = {
        ...context,
        loopData: { iter: iter++, soFar: { start, matched, parsed } },
      }

      const result = parser(loc, input, iterContext)

      if (!result.ok) {
        if (interMadeExpectation || result.precedence) {
          return withErr(result, context, options?.matchError)
        }

        if (beforeInterMatching) {
          loc = beforeInterMatching
          matched.pop()
        }

        return success(start, loc, parsed, matched.join(''))
      }

      const { data } = result

      input = sliceInput(input, loc, data.next)
      loc = data.next

      parsed.push(data)
      matched.push(data.matched)

      if (options?.inter) {
        const interResult = options.inter(loc, input, iterContext)

        if (!interResult.ok) {
          if (data.neutralError) {
            continue
          } else {
            return success(start, loc, parsed, matched.join(''))
          }
        }

        const { data: interData } = interResult

        beforeInterMatching = loc
        input = sliceInput(input, loc, interData.next)
        loc = interData.next

        matched.push(interData.matched)

        if (options?.interMatchingMakesExpectation) {
          interMadeExpectation = true
        }
      }
    }
  }
}

export function takeWhile1N<T>(
  parser: Parser<T>,
  options?: TakeWhileOptions & { noMatchError?: string }
): Parser<Token<T>[]> {
  return then(takeWhile(parser, options), (parsed, context) =>
    parsed.data.parsed.length === 0 ? err(parsed.data.start, context, options?.noMatchError) : parsed
  )
}

export function takeWhileMN<T>(
  parser: Parser<T>,
  options: TakeWhileOptions & { noMatchError?: string; minimum: number }
): Parser<Token<T>[]> {
  return then(takeWhile(parser, options), (parsed, context) =>
    parsed.data.parsed.length < options.minimum ? err(parsed.data.start, context, options?.noMatchError) : parsed
  )
}

export function takeForever<T>(parser: Parser<T>): Parser<Token<T>[]> {
  return (start, input, context) => {
    const parsed: Token<T>[] = []
    const matched: string[] = []

    let loc = { ...start }
    let iter = 0

    while (input.length > 0) {
      const result = parser(loc, input, {
        ...context,
        loopData: { iter: iter++, soFar: { start, matched, parsed } },
      })

      if (!result.ok) {
        if (result.precedence) {
          return result
        } else {
          break
        }
      }

      const { data } = result

      input = sliceInput(input, loc, data.next)
      loc = data.next

      parsed.push(data)
      matched.push(data.matched)
    }

    return success(start, loc, parsed, matched.join(''))
  }
}
