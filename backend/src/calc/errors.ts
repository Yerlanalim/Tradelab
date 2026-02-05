export type ApiStatus = 'ok' | 'incomplete' | 'escalation_required';

export class MissingInputError extends Error {
  public fields: string[];
  public partialResult?: any;
  
  constructor(fields: string[], partialResult?: any) {
    super(`Missing required inputs: ${fields.join(', ')}`);
    this.name = 'MissingInputError';
    this.fields = fields;
    this.partialResult = partialResult;
  }
}

export class UnsupportedTariffError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsupportedTariffError';
  }
}

export class EscalationRequiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EscalationRequiredError';
  }
}

export class UnsupportedFeatureError extends Error {
  public feature: string;
  
  constructor(message: string, feature?: string) {
    super(message);
    this.name = 'UnsupportedFeatureError';
    this.feature = feature || 'unknown';
  }
}

export class ServiceUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ServiceUnavailableError';
  }
}
