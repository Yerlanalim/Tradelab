import express, { Request, Response } from 'express';
import { DealPassport } from './types/contracts';
import { validateForCalculation } from './validators/validateForCalculation';
import { CalculationOrchestrator } from './orchestrator/CalculationOrchestrator';
import {
  EscalationRequiredError,
  UnsupportedFeatureError,
  UnsupportedTariffError
} from './errors';
import { logger } from '../logger';

const router = express.Router();
const orchestrator = new CalculationOrchestrator();

/**
 * GET /api/hs/lookup
 * 
 * Proxy to TNVED service for HS code lookup (exact or prefix)
 */
router.get('/hs/lookup', async (req: Request, res: Response) => {
  const code = req.query.code as string;
  if (!code) return res.status(400).json({ error: 'Code required' });
  
  try {
    const tnvedPort = process.env.TNVED_PORT || '3002';
    // Use 127.0.0.1 to avoid ipv6 issues with localhost sometimes
    const response = await fetch(`http://127.0.0.1:${tnvedPort}/hs/code/${code}`);
    
    if (!response.ok) {
       // Improve UX: 404/422 -> just { found: false }
       if (response.status === 404 || response.status === 422) {
         return res.json({ found: false });
       }
       const errBody = await response.json().catch(() => ({}));
       return res.status(response.status).json(errBody);
    }
    const data = await response.json();
    return res.json(data);
  } catch (e: any) {
    logger.error('TNVED service unavailable', { error: e.message });
    // Fail gracefully so UI just doesn't show hint
    return res.status(503).json({ error: 'TNVED service unavailable' });
  }
});

/**
 * POST /api/calc/quote
 * 
 * Calculate full quote including logistics, customs value, duty, and VAT
 * 
 * Returns:
 * - 200: Always for ok/incomplete/escalation_required statuses
 * - 400: Validation errors (missing required fields, invalid types)
 * - 500: Real failures (DB down, bugs)
 */
router.post('/calc/quote', async (req: Request, res: Response) => {
  const startTime = Date.now();
  
  try {
    const passport: DealPassport = req.body;
    
    // Basic validation
    if (!passport || typeof passport !== 'object') {
      return res.status(400).json({
        error: 'Invalid request body',
        message: 'Request body must be a valid DealPassport object'
      });
    }
    
    // Validate required fields
    const validation = validateForCalculation(passport);
    if (!validation.valid) {
      return res.status(400).json({
        error: 'Validation failed',
        missing_inputs: validation.missing_inputs
      });
    }
    
    // Log request parameters
    logger.info('calc/quote request', {
      dest_country: passport.dest_country,
      country_of_origin: passport.country_of_origin,
      incoterms: passport.incoterms,
      weight_gross_kg: passport.weight_gross_kg,
      mode_preference: passport.mode_preference
    });

    // Execute calculation
    const calculationPackage = await orchestrator.execute(passport);

    // Log selected modes
    const usedModes = calculationPackage.logistics?.scenarios?.map((s: any) => s.mode) || [];
    logger.debug('calc/quote used modes', { modes: usedModes });
    
    // Log completion
    logger.info('calc/quote completed', {
      total_ms: calculationPackage.meta.query_time_ms,
      dest_country: passport.dest_country,
      status: calculationPackage.status,
      requires_escalation: calculationPackage.requires_escalation,
      confidence_level: calculationPackage.confidence_level
    });
    
    // Always return 200 for successful calculations
    return res.status(200).json(calculationPackage);
    
  } catch (error: any) {
    // Handle known escalation errors
    if (error instanceof EscalationRequiredError) {
      logger.warn('calc/quote escalation required', { reason: error.message });
      return res.status(200).json({
        meta: {
          query_time_ms: Date.now() - startTime,
          calculation_timestamp: new Date().toISOString(),
          schema_versions: {}
        },
        status: 'escalation_required',
        escalation_reasons: [error.message],
        requires_escalation: true,
        confidence_level: 'low'
      });
    }
    
    // Handle unsupported tariff errors
    if (error instanceof UnsupportedTariffError) {
      logger.warn('calc/quote unsupported tariff', { reason: error.message });
      return res.status(200).json({
        meta: {
          query_time_ms: Date.now() - startTime,
          calculation_timestamp: new Date().toISOString(),
          schema_versions: {}
        },
        status: 'escalation_required',
        escalation_reasons: [error.message],
        requires_escalation: true,
        confidence_level: 'low'
      });
    }
    
    // Handle unsupported feature errors
    if (error instanceof UnsupportedFeatureError) {
      logger.warn('calc/quote unsupported feature', { reason: error.message });
      return res.status(200).json({
        meta: {
          query_time_ms: Date.now() - startTime,
          calculation_timestamp: new Date().toISOString(),
          schema_versions: {}
        },
        status: 'escalation_required',
        escalation_reasons: [error.message],
        requires_escalation: true,
        confidence_level: 'low'
      });
    }
    
    // Real failures (DB down, bugs, etc.)
    logger.error('calc/quote internal error', { error: error?.message, stack: error?.stack });
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message || 'An unexpected error occurred'
    });
  }
});

export default router;
