import { Token } from '../types/contracts';
import { loadTariffParserRules, ParserRules } from '../config/loadConfig';

export class TariffLexer {
  private rules: ParserRules;
  
  constructor() {
    this.rules = loadTariffParserRules();
  }
  
  tokenize(text: string): Token[] {
    const normalized = text
      .replace(/\u00A0/g, ' ')
      .replace(/(\d),(\d)/g, '$1.$2')
      .trim();
    
    const tokens: Token[] = [];
    let pos = 0;
    
    while (pos < normalized.length) {
      const remaining = normalized.substring(pos);
      
      // 1. Percent
      const percentMatch = remaining.match(/^(\d+(\.\d+)?)\s*%/);
      if (percentMatch) {
        tokens.push({ type: 'percent', value: parseFloat(percentMatch[1]) / 100 });
        pos += percentMatch[0].length;
        continue;
      }
      
      // 2. Specific Rate
      // Pattern: amount currency (per|/) [multiplier] unit
      // Group 5 captures the full multiplier (e.g. "1000 " from "за 1000 шт"),
      // so normalizeUnit receives "1000 шт" and can match the 1000pcs pattern.
      const specificPattern = new RegExp(
        `^(\\d+(\\.\\d+)?)\\s*(${this.rules.currencies.join('|')})` +
        `\\s*(за|per|/)\\s*((?:\\d+\\s*)?)(${this.rules.units.map(u => u.pattern).join('|')})`,
        'i'
      );
      const specificMatch = remaining.match(specificPattern);
      if (specificMatch) {
        tokens.push({
          type: 'specific',
          amount: parseFloat(specificMatch[1]),
          currency: specificMatch[3].toUpperCase(),
          unit: this.normalizeUnit((specificMatch[5] || '') + specificMatch[6])
        });
        pos += specificMatch[0].length;
        continue;
      }
      
      // 3. Operators
      let operatorFound = false;
      for (const op of this.rules.operators) {
        const opMatch = remaining.match(new RegExp(`^(${op.pattern})`, 'i'));
        if (opMatch) {
          tokens.push({
            type: 'operator',
            operator: op.type,
            escalation: op.escalation || false
          });
          pos += opMatch[0].length;
          operatorFound = true;
          break;
        }
      }
      if (operatorFound) continue;
      
      // 4. Skip separators
      if (/\s|,|;/.test(normalized[pos])) {
        pos++;
        continue;
      }
      
      // 5. Unknown character - skip but log or throw? 
      // Plan says iterate left-to-right. We'll skip and continue to avoid hard failure on Noise.
      pos++;
    }
    
    return tokens;
  }
  
  private normalizeUnit(unit: string): string {
    const found = this.rules.units.find(u => new RegExp(u.pattern, 'i').test(unit));
    return found ? found.normalized : unit;
  }
}
