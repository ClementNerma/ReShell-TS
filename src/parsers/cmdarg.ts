import { Parser } from '../lib/base'
import { combine } from '../lib/combinations'
import { maybe } from '../lib/conditions'
import { failure } from '../lib/errors'
import { maybe_s_nl } from '../lib/littles'
import { exact, oneOfMap } from '../lib/matchers'
import { mappedCases } from '../lib/switches'
import { map } from '../lib/transform'
import { withLatelyDeclared } from '../lib/utils'
import { CmdArg } from './data'
import { expr } from './expr'
import { literalValue } from './literals'
import { identifier } from './tokens'

// For weirdly-shaped arguments provided to external commands, users just have to put them between double quotes to treat
// them as strings just like they are originally in other shells

export const cmdArg: Parser<CmdArg> = mappedCases<CmdArg>()('type', {
  flag: map(
    combine(
      oneOfMap([
        ['--', false],
        ['-', true],
      ]),
      failure(identifier, 'Syntax error: expected identifier after double dash'),
      maybe(
        map(
          combine(
            exact('='),
            failure(
              withLatelyDeclared(() => expr),
              'Syntax error: expected an expression'
            )
          ),
          ([_, expr]) => expr
        )
      )
    ),
    ([short, name, directValue]) => ({ short, name, directValue: directValue.parsed })
  ),

  expr: map(
    combine(
      exact('${'),
      failure(
        withLatelyDeclared(() => expr),
        'Failed to parse the inner expression'
      ),
      exact('}', 'Expected a closing brace (}) to close the inner expression'),
      { inter: maybe_s_nl }
    ),
    ([_, expr, __]) => ({ type: 'expr', expr })
  ),

  reference: map(combine(exact('$'), failure(identifier, 'Expected a variable name')), ([_, varname]) => ({
    type: 'reference',
    varname,
  })),

  literal: map(literalValue, (_, value) => ({ type: 'literal', value })),
})
