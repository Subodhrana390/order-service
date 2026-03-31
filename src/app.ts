import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { errorHandler } from './middlewares/error.middleware.js';
import orderRoutes from './routes/order.routes.js';
import internalOrderRoutes from './routes/internal-order.routes.js';

const app: Application = express();

app.use(helmet());
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/health', (_: Request, res: Response) => {
    res.status(200).json({
        status: 'UP',
        service: 'order-service',
        timestamp: new Date().toISOString(),
    });
});

// Routes
app.use('/api/v1/orders', orderRoutes);
app.use('/api/v1/internal/orders', internalOrderRoutes);

app.use(errorHandler);

export default app;
