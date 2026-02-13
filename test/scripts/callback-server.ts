import 'dotenv/config';
import fastify from 'fastify';

const PORT = parseInt(process.env.PORT || '3001');

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
};

const server = fastify({
  logger: false,
});

interface CallbackPayload {
  jobId: string;
  status: 'completed' | 'failed';
  success: boolean;
  message: string;
  pullRequestUrl?: string;
  error?: string;
  completedAt: string;
}

// Store received callbacks
const callbacks: CallbackPayload[] = [];

server.post('/callback', async (request, reply) => {
  const payload = request.body as CallbackPayload;
  callbacks.push(payload);

  console.log(`\n${colors.bright}${colors.blue}=== Callback Received ===${colors.reset}`);
  console.log(`Time: ${colors.cyan}${new Date().toLocaleString()}${colors.reset}`);
  console.log(`Job ID: ${colors.cyan}${payload.jobId}${colors.reset}`);
  console.log(`Status: ${payload.status === 'completed' ? colors.green + '✓ COMPLETED' : colors.red + '✗ FAILED'}${colors.reset}`);
  console.log(`Success: ${payload.success ? colors.green + 'Yes' : colors.red + 'No'}${colors.reset}`);
  console.log(`Message: ${payload.message}`);

  if (payload.pullRequestUrl) {
    console.log(`PR URL: ${colors.blue}${payload.pullRequestUrl}${colors.reset}`);
  }

  if (payload.error) {
    console.log(`Error: ${colors.red}${payload.error}${colors.reset}`);
  }

  console.log(`Completed At: ${payload.completedAt}`);
  console.log(`${colors.bright}${colors.blue}========================${colors.reset}\n`);

  return reply.status(200).send({ received: true });
});

server.get('/callbacks', async (request, reply) => {
  return reply.send({
    total: callbacks.length,
    callbacks: callbacks,
  });
});

server.get('/health', async (request, reply) => {
  return reply.send({ status: 'ok', listening: true });
});

server.listen({ port: PORT, host: '0.0.0.0' }, (err, address) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }

  console.log(`${colors.bright}${colors.green}Callback Server Started${colors.reset}`);
  console.log(`${colors.cyan}Listening on: ${address}${colors.reset}`);
  console.log(`\nEndpoints:`);
  console.log(`  POST ${colors.yellow}${address}/callback${colors.reset}     - Receive callbacks`);
  console.log(`  GET  ${colors.yellow}${address}/callbacks${colors.reset}    - View all callbacks`);
  console.log(`  GET  ${colors.yellow}${address}/health${colors.reset}       - Health check`);
  console.log(`\nWaiting for callbacks...`);
  console.log(`${colors.gray}Press Ctrl+C to stop${colors.reset}\n`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log(`\n${colors.yellow}Shutting down...${colors.reset}`);
  await server.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log(`\n${colors.yellow}Shutting down...${colors.reset}`);
  await server.close();
  process.exit(0);
});
