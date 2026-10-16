import { startMessageWorker } from './worker';
import { logger } from '../lib/logger';

const worker = startMessageWorker();
logger.info('worker.started');

async function shutdown(): Promise<void> {
  await worker.close();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
