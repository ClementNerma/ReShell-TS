import { Token } from '../lib/base'

// TODO: function calls, redirections, computed commands '$(...)', '$@(...)', '$^(...)' etc.
// TODO: streams support
// TODO: background tasks management
// TODO: detaching task from shell
// TODO: launching sub-scripts
// TODO: commands declaration
// TODO: accessing struct members
// TODO: methods or wrapping?

export type Program = Token<StatementChain>[]

export type StatementChain =
  | { type: 'empty' }
  | { type: 'single'; stmt: Token<Statement> }
  | { type: 'chain'; left: Token<Statement>; op: Token<StatementChainOp>; right: Token<StatementChain> }

export enum StatementChainOp {
  Then,
  And,
  Or,
  Pipe,
}

export type Statement =
  | { type: 'comment'; content: Token<string> }
  | {
      type: 'variableDecl'
      varname: Token<string>
      vartype: Token<ValueType> | null
      mutable: Token<boolean>
      expr: Token<Expr>
    }
  | { type: 'forLoop'; loopvar: Token<string>; subject: Token<Expr> }
  | { type: 'whileLoop'; cond: Token<Expr> }
  | { type: 'ifBlock'; cond: Token<Expr> }
  | { type: 'elifBlock'; cond: Token<Expr> }
  | { type: 'elseBlock' }
  | { type: 'blockEnd' }
  | { type: 'typeAlias'; typename: Token<string>; content: Token<ValueType> }
  | { type: 'fnOpen'; name: Token<string>; fnType: FnType }
  | { type: 'return'; expr: Token<Expr | null> }
  | { type: 'cmdCall'; name: Token<string>; args: Token<CmdArg>[] }

export type FnType = {
  named: Token<string> | null
  args: Token<FnArg>[]
  returnType: Token<ValueType> | null
}

export type FnArg = {
  // mutable: boolean
  name: Token<string>
  optional: Token<boolean>
  type: Token<ValueType>
  defaultValue: Token<LiteralValue> | null
}

export type CmdArg =
  // NOTE: flags may have a non-direct value, e.g. `--arg value` will be parsed as a long 'arg' flag without direct value,
  // followed by a 'value' expr
  | { type: 'flag'; short: Token<boolean>; name: Token<string>; directValue: Token<Expr> | null }
  | { type: 'reference'; varname: Token<string> }
  | { type: 'expr'; expr: Token<Expr> }
  | { type: 'literal'; value: Token<LiteralValue> }

export type ValueType =
  | { type: 'bool' }
  | { type: 'number' }
  | { type: 'string' }
  | { type: 'path' }
  | { type: 'list'; itemsType: Token<ValueType> }
  | { type: 'map'; itemsType: Token<ValueType> }
  | { type: 'struct'; members: Token<[Token<string>, Token<ValueType>][]> }
  | { type: 'fn'; fnType: FnType }
  | { type: 'aliasRef'; typeAliasName: Token<string> }

export type ResolvedValueType = Exclude<ValueType, { type: 'aliasRef' }>

export type LiteralValue =
  | { type: 'bool'; value: Token<boolean> }
  | { type: 'number'; value: Token<number> }
  | { type: 'string'; value: Token<LiteralString> }
  | { type: 'path'; segments: Token<Token<string>[]> }
  | { type: 'list'; items: Token<Token<Expr>[]> }
  | { type: 'map'; entries: Token<[Token<string>, Token<Expr>][]> }
  | { type: 'closure'; fnType: FnType; body: Token<StatementChain>[] }

export type LiteralString =
  | { type: 'raw'; content: Token<string> }
  | { type: 'computed'; segments: Token<ComputedStringSegment>[] }

export type ComputedStringSegment = { type: 'literal'; content: Token<string> } | { type: 'expr'; expr: Token<Expr> }

export type InlineCmdCall = { name: Token<string>; args: Token<CmdArg>[] }

export type InlineChainedCmdCall = { op: Token<StatementChainOp>; chainedCmdCall: Token<InlineCmdCall> }

export type Value =
  | LiteralValue
  | { type: 'inlineCmdCallSequence'; start: Token<InlineCmdCall>; sequence: Token<InlineChainedCmdCall>[] }
  | { type: 'reference'; varname: Token<string> }

export type ExprPropAccess =
  | { type: 'refIndexOrKey'; indexOrKey: Token<Expr> }
  | { type: 'refStructMember'; member: Token<string> }

export type ExprPropAccessSequence = {
  type: 'propAccessSequence'
  from: Token<Expr>
  sequence: Token<ExprPropAccess>[]
}

export type Expr =
  | { type: 'value'; content: Token<Value> }
  | { type: 'paren'; inner: Token<Expr> }
  | { type: 'doubleOp'; left: Token<Expr>; op: Token<DoubleOp>; right: Token<Expr> }
  | { type: 'singleOp'; op: Token<SingleOp>; right: Token<Expr> }
  | ExprPropAccessSequence

export type DoubleOp = { type: 'arith'; op: Token<DoubleArithOp> } | { type: 'logic'; op: Token<DoubleLogicOp> }

export type DoubleArithOp = '+' | '-' | '*' | '/' | '%'
export type DoubleLogicOp = '&&' | '||'

export type SingleOp = { type: 'logic'; op: Token<SingleLogicOp> }

export type SingleLogicOp = '!'
