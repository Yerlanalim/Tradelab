/**
 * Version endpoint
 */

import type { FastifyPluginAsync } from 'fastify';
import { getDB } from '../db.js';
import { getDatasetCoverage } from '../services/search.service.js';
import type { VersionResponse } from '../types.js';

export const versionRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get('/version', async (request, reply) => {
    const db = getDB();
    
    const schemaVersion = db.prepare('SELECT value FROM metadata WHERE key = ?')
      .get('schema_version') as { value: string };
    
    const dataVersion = db.prepare('SELECT value FROM metadata WHERE key = ?')
      .get('data_version') as { value: string };
    
    const response: VersionResponse = {
      schema_version: schemaVersion.value,
      data_version: dataVersion.value,
      dataset_coverage: getDatasetCoverage()
    };
    
    return reply.code(200).send(response);
  });
};
