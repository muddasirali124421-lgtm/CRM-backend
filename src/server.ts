import http from 'http';
import { app } from './app';
import { env } from './config/env';

/**
 * Create HTTP server wrapping Express application.
 * Note: Wrapping with http.createServer ensures seamless integration with
 * WebSockets / Socket.IO for future chat and real-time notification modules.
 */
const server = http.createServer(app);

const PORT = env.PORT;

server.listen(PORT, () => {
  console.log(`========================================`);
  console.log(` OfficeCRM Backend Server Started`);
  console.log(` Environment : ${env.NODE_ENV}`);
  console.log(` Port        : ${PORT}`);
  console.log(` Health URL  : http://localhost:${PORT}/api/health`);
  console.log(` CORS Origin : ${env.FRONTEND_URL}`);
  console.log(`========================================`);
});

// Graceful shutdown handling
function handleShutdown(signal: string) {
  console.log(`\nReceived ${signal}. Shutting down gracefully...`);
  server.close(() => {
    console.log('HTTP server closed.');
    process.exit(0);
  });

  // Force close if graceful shutdown hangs
  setTimeout(() => {
    console.error('Forcing shutdown after timeout.');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));

export default server;
