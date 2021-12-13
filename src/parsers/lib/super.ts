import { err, ErrInputData, Parser, sliceInput, withErr, WithErrData } from './base'
import { combine } from './combinations'
import { failureMaybe } from './errors'
import { maybe_s } from './littles'
import { bol, eol } from './matchers'
import { map } from './transform'

export function fullLine<T>(
  parser: Parser<T>,
  errors?: { bol?: ErrInputData; error?: WithErrData; eol?: ErrInputData }
): Parser<T> {
  return map(
    combine(bol(errors?.bol), failureMaybe(parser, errors?.error), eol(errors?.eol)),
    ([_, { parsed }, __]) => parsed
  )
}

export function fullTrimmedLine<T>(
  parser: Parser<T>,
  errors?: { bol?: ErrInputData; error?: WithErrData; eol?: ErrInputData }
): Parser<T> {
  return map(
    combine(bol(errors?.bol), failureMaybe(parser, errors?.error), eol(errors?.eol), { inter: maybe_s }),
    ([_, { parsed }, __]) => parsed
  )
}

export function fullSource<T>(
  parser: Parser<T>,
  errors?: { bos?: ErrInputData; error?: WithErrData; eos?: ErrInputData }
): Parser<T> {
  return (start, input, context) => {
    if (start.col !== 0 || start.line !== 0) return err(start, start, context, errors?.bos)

    const parsed = parser(start, input, context)
    if (!parsed.ok) return withErr(parsed, context, errors?.error)

    const remaining = sliceInput(input, start, parsed.data.at.next)

    if (remaining.length > 0) return err(parsed.data.at.next, parsed.data.at.next, context, errors?.eos)

    return parsed
  }
}
