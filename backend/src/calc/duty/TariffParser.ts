import { DutyAST, Token } from '../types/contracts';
import { TariffLexer } from './TariffLexer';
import { UnsupportedTariffError } from '../errors';

export class TariffParser {
  private lexer: TariffLexer;
  
  constructor() {
    this.lexer = new TariffLexer();
  }
  
  parse(raw: string): DutyAST {
    const tokens = this.lexer.tokenize(raw);
    
    if (tokens.length === 0) {
      throw new Error(`Unable to tokenize tariff: "${raw}"`);
    }
    
    // Check for escalation operators (e.g. "or")
    const hasEscalationOp = tokens.some(t => t.type === 'operator' && t.escalation);
    if (hasEscalationOp) {
      throw new UnsupportedTariffError(`Tariff contains complex operator requiring escalation: "${raw}"`);
    }
    
    return this.parseExpression(tokens);
  }
  
  private parseExpression(tokens: Token[]): DutyAST {
    const percents = tokens.filter(t => t.type === 'percent');
    const specifics = tokens.filter(t => t.type === 'specific');
    const operators = tokens.filter(t => t.type === 'operator');
    
    // MVP Limitation: multiple specific rates not supported
    if (specifics.length > 1) {
      throw new UnsupportedTariffError('Multiple specific rates not supported in current version');
    }
    
    const opType = operators[0]?.operator;
    
    // MVP Limitation: sum of two percentages not supported
    if (opType === 'sum' && percents.length > 1) {
      throw new UnsupportedTariffError('Sum of multiple ad valorem rates not supported in current version');
    }
    
    // Case 1: MAX (advalorem OR specific)
    if (opType === 'max' && percents.length > 0 && specifics.length > 0) {
      return {
        kind: 'max',
        options: [
          { kind: 'advalorem', percent: percents[0].value! },
          { 
            kind: 'specific', 
            amount: specifics[0].amount!, 
            currency: specifics[0].currency!, 
            unit: specifics[0].unit! 
          }
        ]
      };
    }
    
    // Case 2: SUM (advalorem + specific)
    if (opType === 'sum' && percents.length > 0 && specifics.length > 0) {
      return {
        kind: 'sum',
        advalorem: { kind: 'advalorem', percent: percents[0].value! },
        specific: { 
          kind: 'specific', 
          amount: specifics[0].amount!, 
          currency: specifics[0].currency!, 
          unit: specifics[0].unit! 
        }
      };
    }
    
    // Case 3: Simple Ad Valorem
    if (percents.length > 0 && specifics.length === 0) {
      return { kind: 'advalorem', percent: percents[0].value! };
    }
    
    // Case 4: Simple Specific
    if (specifics.length > 0 && percents.length === 0) {
      return { 
        kind: 'specific', 
        amount: specifics[0].amount!, 
        currency: specifics[0].currency!, 
        unit: specifics[0].unit! 
      };
    }
    
    throw new UnsupportedTariffError(`Unsupported tariff structure: "${JSON.stringify(tokens)}"`);
  }
}
