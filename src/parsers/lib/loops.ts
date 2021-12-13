import { CodeLoc, Token } from '../../shared/parsed'
import { err, ErrInputData, Parser, success, withErr, WithErrData } from './base'

export type TakeWhileOptions = {
  inter?: Parser<unknown>
  interExpect: false | WithErrData
}

export function takeWhile<T>(parser: Parser<T>, options?: TakeWhileOptions): Parser<Token<T>[]> {
  return (start, input, context) => {
    const parsed: Token<T>[] = []
    const matched: string[] = []
    let interMadeExpectation: false | WithErrData = false
    let beforeInterMatching: CodeLoc | null = null

    let next = { ...start }

    while (true) {
      const result = parser(next, input, context)

      if (!result.ok) {
        if (result.precedence) {
          return result
        }

        if (interMadeExpectation) {
          return withErr(result, interMadeExpectation)
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

        if (options?.interExpect) {
          interMadeExpectation = options.interExpect
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
  const take = takeWhile(parser, options)

  return (start, input, context) => {
    const parsed = take(start, input, context)
    return parsed.ok
      ? parsed.data.parsed.length === 0
        ? err(parsed.data.at.start, parsed.data.at.next, context, options?.noMatchError)
        : { ok: true, data: parsed.data }
      : parsed
  }
}

export function takeWhileN<T>(
  parser: Parser<T>,
  options: TakeWhileOptions & { notEnoughMatchError?: ErrInputData; minimum: number }
): Parser<Token<T>[]> {
  const take = takeWhile(parser, options)

  return (start, input, context) => {
    const parsed = take(start, input, context)
    return parsed.ok
      ? parsed.data.parsed.length < options.minimum
        ? err(parsed.data.at.start, parsed.data.at.next, context, options?.notEnoughMatchError)
        : { ok: true, data: parsed.data }
      : parsed
  }
}
