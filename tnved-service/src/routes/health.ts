/**
 * Health check endpoint
 */

import type { FastifyPluginAsync } from 'fastify';
import { getDB } from '../db.js';
import type { HealthResponse } from '../types.js';

export const healthRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get('/health', async (request, reply) => {
    try {
      const db = getDB();
      // Простая проверка подключения
      db.prepare('SELECT 1').get();
      
      const response: HealthResponse = {
        status: 'ok',
        db_connected: true
      };
      
      return reply.code(200).send(response);
    } catch (error) {
      const response: HealthResponse = {
        status: 'error',
        db_connected: false
      };
      
      return reply.code(503).send(response);
    }
  });
};
