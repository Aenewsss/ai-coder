import * as fs from 'node:fs';
import * as path from 'node:path';

// Read Redis connection info written by globalSetup (runs before this file)
const REDIS_PORT_FILE = path.join(process.cwd(), '.test-redis-port');
const { host, port } = JSON.parse(fs.readFileSync(REDIS_PORT_FILE, 'utf-8'));

// Set env vars before any source modules (env.ts, queue.ts) are imported
process.env.REDIS_URL = `redis://${host}:${port}`;
process.env.REDIS_HOST = host;
process.env.REDIS_PORT = String(port);
