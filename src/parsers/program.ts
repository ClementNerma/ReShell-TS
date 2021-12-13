import { Parser } from '../lib/base'
import { takeForever } from '../lib/loops'
import { fullSource } from '../lib/super'
import { Program } from './data'
import { statementChain } from './statements'

export const program: Parser<Program> = fullSource(takeForever(statementChain))
