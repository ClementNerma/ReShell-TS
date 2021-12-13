import { Parser, ParserResult, parseSource } from '../lib/base'
import { formatErr } from '../lib/utils'
import { Settings, Severity } from '../settings'

export class Engine<T, C> {
  constructor(private readonly parser: Parser<T>, private readonly settings: Settings) {}

  parse(input: string, context: C, disableErrorReporting?: boolean): ParserResult<T> {
    const result = parseSource(input, this.parser, context)

    if (!disableErrorReporting && !result.ok) {
      this.settings.loggers.error(formatErr(result, this.settings.formatters), Severity.High)
    }

    return result
  }
}
