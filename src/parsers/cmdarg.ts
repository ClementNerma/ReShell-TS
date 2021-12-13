import { CmdArg, CmdFlag } from '../shared/ast'
import { expr } from './expr'
import { Parser } from './lib/base'
import { combine } from './lib/combinations'
import { maybe } from './lib/conditions'
import { failure } from './lib/errors'
import { maybe_s_nl } from './lib/littles'
import { exact, oneOfMap } from './lib/matchers'
import { mappedCases } from './lib/switches'
import { map, toOneProp } from './lib/transform'
import { withLatelyDeclared } from './lib/utils'
import { cmdAction, identifier } from './tokens'
import { value } from './value'

// For weirdly-shaped arguments provided to external commands, users just have to put them between double quotes to treat
// them as strings just like they are originally in other shells

export const cmdFlag: Parser<CmdFlag> = map(
  combine(
    oneOfMap([
      ['--', false],
      ['-', true],
    ]),
    failure(identifier, 'expected a flag name'),
    maybe(
      map(
        combine(
          exact('='),
          failure(
            withLatelyDeclared(() => expr),
            'expected an expression'
          )
        ),
        ([_, expr]) => expr
      )
    )
  ),
  ([short, name, { parsed: directValue }]) => ({ short, name, directValue })
)

export const cmdArg: Parser<CmdArg> = mappedCases<CmdArg>()('type', {
  flag: cmdFlag,

  action: toOneProp('name', cmdAction),

  expr: map(
    combine(
      combine(exact('${'), maybe_s_nl),
      failure(
        withLatelyDeclared(() => expr),
        'failed to parse the inner expression'
      ),
      maybe_s_nl,
      exact('}', 'expected a closing brace (}) to close the inner expression')
    ),
    ([_, expr]) => ({ expr })
  ),

  value: toOneProp('value', value),

  rest: map(combine(exact('...'), failure(identifier, 'expected a rest variable name')), ([_, varname]) => ({
    varname,
  })),
})
