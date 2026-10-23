const app = require('./app');
const env = require('./config/env');
const { connectDB, disconnectDB } = require('./config/database');

async function startServer() {
  // Connect to database if URI is configured
  await connectDB();

  const server = app.listen(env.PORT, () => {
    console.log(`[SERVER] AI Chatbot Platform Backend running in ${env.NODE_ENV} mode on port ${env.PORT}`);
    console.log(`[SERVER] Health check available at: http://localhost:${env.PORT}/health`);
  });

  // Graceful shutdown handling
  const shutdown = async (signal) => {
    console.log(`[SERVER] Received ${signal}. Starting graceful shutdown...`);
    server.close(async () => {
      console.log('[SERVER] HTTP server closed.');
      await disconnectDB();
      process.exit(0);
    });

    // Force shutdown after 10s timeout
    setTimeout(() => {
      console.error('[SERVER] Forcefully terminating process after timeout.');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  return server;
}

// Start only if executed directly
if (require.main === module) {
  startServer().catch((err) => {
    console.error('[SERVER FATAL] Failed to start server:', err);
    process.exit(1);
  });
}

module.exports = { startServer };
