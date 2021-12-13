import { Settings, Severity } from '../../settings'
import { Parser, ParserResult, parseSource, Token } from '../base'
import { formatErr } from '../utils'
import { Executor, ExecutorResult } from './exec'

export class Engine<T, C, O, E> {
  constructor(
    private readonly parser: Parser<T>,
    private readonly executor: Executor<T, C, O, E>,
    private readonly settings: Settings
  ) {}

  parse<C>(input: string, context: C, disableErrorReporting?: boolean): ParserResult<T> {
    const result = parseSource(input, this.parser, context)

    if (!disableErrorReporting && !result.ok) {
      this.settings.loggers.error(formatErr(result, this.settings.formatters), Severity.High)
    }

    return result
  }

  execute(parsed: Token<T>, context: C): ExecutorResult<O, E> {
    return this.executor(parsed, context)
  }
}
