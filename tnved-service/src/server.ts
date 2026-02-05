/**
 * ТНВЭД/HS Microservice
 * Main server entry point
 */

import Fastify from 'fastify';
import cors from '@fastify/cors';
import { config } from 'dotenv';
import { existsSync } from 'fs';
import { resolve } from 'path';
import { healthRoute } from './routes/health.js';
import { versionRoute } from './routes/version.js';
import { codeRoute } from './routes/hs/code.js';
import { searchRoute } from './routes/hs/search.js';

// Продвинутая загрузка конфигурации для монорепозитория
const localEnv = resolve(process.cwd(), '.env');
const parentEnv = resolve(process.cwd(), '../.env');

if (existsSync(localEnv)) {
  config({ path: localEnv });
} else if (existsSync(parentEnv)) {
  config({ path: parentEnv });
} else {
  console.warn('⚠️ No .env file found in service or parent directory. Using environment defaults.');
}

const PORT = parseInt(process.env.TNVED_PORT || '3002', 10);
const HOST = process.env.TNVED_HOST || '0.0.0.0';
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';

const fastify = Fastify({
  logger: {
    level: LOG_LEVEL,
    transport: {
      target: 'pino-pretty',
      options: {
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid,hostname',
        colorize: true
      }
    }
  },
  // Защита от слишком больших запросов
  bodyLimit: 1048576, // 1MB
});

// Настройка CORS
await fastify.register(cors, {
  origin: process.env.CORS_ORIGIN === '*' ? true : (process.env.CORS_ORIGIN || true),
  methods: ['GET', 'OPTIONS']
});

// Группировка роутов
await fastify.register(async (api) => {
  api.register(healthRoute);
  api.register(versionRoute);
  api.register(codeRoute);
  api.register(searchRoute);
});

// Централизованная обработка ошибок
fastify.setErrorHandler((error, request, reply) => {
  const isProd = process.env.NODE_ENV === 'production';
  const statusCode = (error as any).statusCode || 500;
  
  request.log.error(error);
  
  reply.status(statusCode).send({
    error: isProd ? 'Internal Server Error' : (error as any).message,
    statusCode: statusCode,
    timestamp: new Date().toISOString()
  });
});

/**
 * Запуск сервера
 */
const start = async () => {
  try {
    await fastify.listen({ port: PORT, host: HOST });
    const address = fastify.server.address();
    const boundPort = typeof address === 'string' ? address : address?.port;
    
    console.log(`
  🚀 TNVED Service started successfully
  ---------------------------------------
  📡 Address: http://${HOST}:${boundPort}
  🔍 Search:  /hs/search?q=...
  🔢 Code:    /hs/code/:code
  📊 Health:  /health
  ---------------------------------------
    `);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
