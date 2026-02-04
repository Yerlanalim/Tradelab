/**
 * HS Code search endpoint
 */

import type { FastifyPluginAsync } from 'fastify';
import { searchByCode, getDatasetCoverage } from '../../services/search.service.js';
import type { SearchByCodeResponse } from '../../types.js';

export const codeRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Params: { code: string };
    Querystring: { include_examples?: string };
  }>('/hs/code/:code', {
    schema: {
      params: {
        type: 'object',
        required: ['code'],
        properties: {
          code: { type: 'string', minLength: 4, maxLength: 10 }
        }
      },
      querystring: {
        type: 'object',
        properties: {
          include_examples: { type: 'string', enum: ['true', 'false'] }
        }
      }
    }
  }, async (request, reply) => {
    const startTime = Date.now();
    const { code } = request.params;
    const includeExamples = request.query.include_examples !== 'false';
    
    try {
      const result = searchByCode(code, includeExamples);
      
      const response: SearchByCodeResponse = {
        exact: result.exact || undefined,
        prefix_info: result.prefix_info,
        meta: {
          query_time_ms: Date.now() - startTime,
          source: 'offline',
          match: result.query_type as 'exact' | 'prefix',
          dataset_coverage: getDatasetCoverage()
        }
      };
      
      return reply.code(200).send(response);
    } catch (error) {
      return reply.code(400).send({
        error: (error as Error).message
      });
    }
  });
};
