import { config } from "../../config/index.js";
import { kafkaClient } from "./client.js";
import { PaymentEventHandler } from "./handlers/payment.handler.js";
import { OrderEventHandler } from "./handlers/order.handler.js";

export async function initializeKafka(): Promise<void> {
  try {
    console.log("🚀 Initializing Kafka for Order Service...");

    await kafkaClient.connectProducer();

    const consumer = await kafkaClient.connectConsumer(
      config.kafka.groupId,
    );

    await consumer.subscribe({
      topics: [
        config.kafka.topics.paymentEvents,
        config.kafka.topics.orderEvents
      ],
      fromBeginning: false,
    });

    const paymentHandler = new PaymentEventHandler();
    const orderHandler = new OrderEventHandler();

    await consumer.run({
      eachMessage: async ({ topic, message }) => {
        if (!message.value) return;

        try {
          const event = JSON.parse(message.value.toString());

          if (topic === config.kafka.topics.paymentEvents) {
            await paymentHandler.handle(event);
          } else if (
            topic === config.kafka.topics.orderEvents
          ) {
            await orderHandler.handle(event);
          }
        } catch (err) {
          console.error("Kafka message processing failed:", err);
        }
      },
    });

    console.log("✅ Kafka initialized and consuming events");
  } catch (error) {
    console.error("❌ Failed to initialize Kafka:", error);
    throw error;
  }
}
