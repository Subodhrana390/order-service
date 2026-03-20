import { Kafka, SASLOptions, Producer, Consumer, Admin } from "kafkajs";
import { config } from "../../config/index.js";

const sasl: SASLOptions = {
    mechanism: config.kafka.sasl.mechanism,
    username: config.kafka.sasl.username,
    password: config.kafka.sasl.password,
};

class KafkaClient {
  private kafka: Kafka;
  private producer: Producer | null = null;
  private consumers: Map<string, Consumer> = new Map();
  private admin: Admin | null = null;
  private isConnected = false;

  constructor() {
     this.kafka = new Kafka({
            clientId: config.kafka.clientId,
            brokers: [config.kafka.brokers],
            retry: {
                initialRetryTime: config.kafka.retryDelay,
                retries: config.kafka.retries,
            },
            sasl,
            ssl: config.kafka.ssl,
            connectionTimeout: config.kafka.connectionTimeout,
            requestTimeout: config.kafka.requestTimeout,
        });
  }

  async connectProducer(): Promise<void> {
    if (this.producer) return;
    this.producer = this.kafka.producer();
    await this.producer.connect();
    this.isConnected = true;
    console.log("✓ Kafka producer connected");
  }

  async connectConsumer(groupId: string): Promise<Consumer> {
    if (this.consumers.has(groupId)) return this.consumers.get(groupId)!;
    const consumer = this.kafka.consumer({ groupId });
    await consumer.connect();
    this.consumers.set(groupId, consumer);
    return consumer;
  }

  async createTopics(topics: string[]): Promise<void> {
    const admin = this.kafka.admin();
    await admin.connect();
    await admin.createTopics({
      topics: topics.map((topic) => ({ topic, numPartitions: 3 })),
      waitForLeaders: true,
    });
    await admin.disconnect();
  }

  getProducer(): Producer {
    if (!this.producer) throw new Error("Producer not connected");
    return this.producer;
  }

  async disconnect(): Promise<void> {
    if (this.producer) await this.producer.disconnect();
    for (const consumer of this.consumers.values()) {
      await consumer.disconnect();
    }
  }
}

export const kafkaClient = new KafkaClient();
