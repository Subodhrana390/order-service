import dotenv from "dotenv";
import fs from "fs";
import path from "path";
dotenv.config({});

const nodeEnv = process.env.NODE_ENV || "development";

const caPath =
  nodeEnv === "production"
    ? "/etc/secrets/ca.pem"
    : path.resolve(process.cwd(), "src/certs/ca.pem");

const getCA = (): string[] | undefined => {
  if (fs.existsSync(caPath)) {
    return [fs.readFileSync(caPath, "utf-8")];
  }
  return undefined;
};

export const config = {
  env: nodeEnv,
  port: Number(process.env.APP_ORDER_SERVICE_PORT || "3003"),
  mongodb: {
    uri: process.env.APP_ORDER_MONGO_URI!,
  },
  jwt: {
    secret: process.env.JWT_ACCESS_SECRET!,
    expiresIn: process.env.JWT_ACCESS_EXPIRE_IN || "15m",
  },
  kafka: {
    clientId: process.env.APP_ORDER_KAFKA_CLIENT_ID || "order-service",
    brokers: process.env.APP_KAFKA_BROKER!,
    groupId: process.env.APP_ORDER_KAFKA_GROUP_ID!,
    sasl: {
      mechanism: process.env.APP_KAFKA_SASL_MECHANISM! as
        | "plain"
        | "scram-sha-256"
        | "scram-sha-512",
      username: process.env.APP_KAFKA_SASL_USERNAME!,
      password: process.env.APP_KAFKA_SASL_PASSWORD!,
    },
    ssl: getCA()
      ? { rejectUnauthorized: true, ca: getCA() }
      : process.env.APP_KAFKA_SSL === "true",
    retries: Number(process.env.APP_KAFKA_RETRIES || 5),
    retryDelay: Number(process.env.APP_KAFKA_RETRY_DELAY || 1000),
    connectionTimeout: Number(process.env.APP_KAFKA_CONNECTION_TIMEOUT),
    requestTimeout: Number(process.env.APP_KAFKA_REQUEST_TIMEOUT),
    topics: {
      orderEvents: process.env.KAFKA_TOPIC_ORDER_EVENTS!,
      paymentEvents: process.env.KAFKA_TOPIC_PAYMENT_EVENTS!,
      userEvents: process.env.KAFKA_TOPIC_USER_EVENTS!,
      deliveryEvents: process.env.KAFKA_TOPIC_DELIVERY_EVENTS!,
    },
  },
  redis: {
    uri: process.env.APP_REDIS_URL!,
  },
  services: {
    product: process.env.APP_PRODUCT_SERVICE_URL || "http://localhost:3010",
    inventory: process.env.APP_INVENTORY_SERVICE_URL || "http://localhost:3008",
    shop: process.env.APP_SHOP_SERVICE_URL || "http://localhost:3004",
    cart: process.env.APP_CART_SERVICE_URL || "http://localhost:3005",
    payment: process.env.APP_PAYMENT_SERVICE_URL || "http://localhost:3006",
    discovery: process.env.APP_DISCOVERY_SERVICE_URL || "http://localhost:3011",
    delivery: process.env.APP_DELIVERY_SERVICE_URL || "http://localhost:3009",
  },
  elasticSearch: {
    node: process.env.APP_ELASTICSEARCH_NODE!,
  },
  isProduction: nodeEnv === "production",
};
