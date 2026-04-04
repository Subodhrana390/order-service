import { kafkaClient } from "./client.js";
import { config } from "../../config/index.js";

export class KafkaProducer {
    static async sendMessage(topic: string, type: string, payload: any) {
        try {
            const producer = kafkaClient.getProducer();
            await producer.send({
                topic,
                messages: [
                    {
                        value: JSON.stringify({
                            type,
                            payload,
                            timestamp: new Date().toISOString(),
                        }),
                    },
                ],
            });
        } catch (error) {
            console.error(`Error sending Kafka message to ${topic}:`, error);
        }
    }

    static async sendOrderEvent(type: string, payload: any) {
        await this.sendMessage(config.kafka.topics.orderEvents, type, payload);
    }
}
