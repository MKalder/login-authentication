import express from 'express';
import authRoutes from './routes/auth.routes.js';

const app = express();
app.set('trust proxy', 1);
app.use(express.json());
app.use('/auth', authRoutes);

export default app;