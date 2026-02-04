/**
 * HS Code text search endpoint
 */

import type { FastifyPluginAsync } from 'fastify';
import { searchByText, detectQueryType, searchByCode, getDatasetCoverage } from '../../services/search.service.js';
import type { SearchByTextResponse, SearchByCodeResponse } from '../../types.js';

export const searchRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: { q: string; limit?: string };
  }>('/hs/search', async (request, reply) => {
    const startTime = Date.now();
    const { q } = request.query;
    
    if (!q || q.length < 3) {
      return reply.code(400).send({
        error: 'Query parameter "q" is required and must be at least 3 characters'
      });
    }
    
    const limit = Math.min(parseInt(request.query.limit || '10'), 50);
    
    // Определяем тип запроса
    const queryType = detectQueryType(q);
    
    if (queryType === 'code') {
      // Если это код, перенаправляем на поиск по коду
      try {
        const result = searchByCode(q, false);
        
        const response: SearchByCodeResponse = {
          exact: result.exact || undefined,
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
    }
    
    // Текстовый поиск
    try {
      const { results, match, source } = await searchByText(q, limit);
      
      const response: SearchByTextResponse = {
        results,
        total: results.length,
        meta: {
          query_time_ms: Date.now() - startTime,
          source,
          match,
          dataset_coverage: getDatasetCoverage()
        }
      };
      
      return reply.code(200).send(response);
    } catch (error) {
      return reply.code(500).send({
        error: (error as Error).message
      });
    }
  });
};
