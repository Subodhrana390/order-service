import { initializeKafka } from "./infrastructure/kafka/init.js";
import mongoose from "mongoose";
import app from "./app.js";
import { config } from "./config/index.js";
const startServer = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(config.mongodb.uri);
    console.log("✅ Order Service DB connected");

    // await initializeKafka();

    // Start HTTP server
    const server = app.listen(config.port, () => {
      console.log(
        `🚀 Order Service running on port ${config.port} in ${config.env} mode`,
      );
    });

    // Graceful shutdown
    const gracefulShutdown = async (signal: string) => {
      console.log(`\n${signal} received, shutting down gracefully...`);

      server.close(async () => {
        console.log("HTTP server closed");

        await mongoose.connection.close();
        console.log("MongoDB connection closed");

        process.exit(0);
      });

      setTimeout(() => {
        console.error("Forced shutdown after timeout");
        process.exit(1);
      }, 10000);
    };

    process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
    process.on("SIGINT", () => gracefulShutdown("SIGINT"));
  } catch (error) {
    console.error("❌ Failed to start server:", error);
    process.exit(1);
  }
};

startServer();

process.on("unhandledRejection", (err: Error) => {
  console.error("UNHANDLED REJECTION! 💥 Shutting down...");
  console.error(err.name, err.message);
  process.exit(1);
});
