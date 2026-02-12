import { GenericContainer, Wait } from 'testcontainers';
import * as fs from 'node:fs';
import * as path from 'node:path';

const REDIS_PORT_FILE = path.join(process.cwd(), '.test-redis-port');

export async function setup() {
  const container = await new GenericContainer('redis:7-alpine')
    .withExposedPorts(6379)
    .withWaitStrategy(Wait.forLogMessage('Ready to accept connections'))
    .start();

  const host = container.getHost();
  const port = container.getMappedPort(6379);

  // Write connection info to a temp file for setupFiles to read
  fs.writeFileSync(REDIS_PORT_FILE, JSON.stringify({ host, port }));

  // Return teardown function
  return async () => {
    await container.stop();
    try {
      fs.unlinkSync(REDIS_PORT_FILE);
    } catch {
      // file may already be cleaned up
    }
  };
}
