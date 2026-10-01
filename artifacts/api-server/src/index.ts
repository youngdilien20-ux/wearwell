import app from "./app";
import { logger } from "./lib/logger";
import { startNotificationWorker } from "./lib/notificationWorker";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
  stopNotificationWorker = startNotificationWorker();
});

let stopNotificationWorker = () => undefined;

function shutdown(signal: string) {
  logger.info({ signal }, "Shutting down API server");
  stopNotificationWorker();
  server.close((err) => {
    if (err) {
      logger.error({ err }, "Error closing API server");
      process.exit(1);
    }
    process.exit(0);
  });
}

process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));
