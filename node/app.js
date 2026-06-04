import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import authRoutes from './routes/auth.routes.js';
import { ALLOWED_ORIGINS } from './config/env.js';

const app = express();

app.set('trust proxy', 1);

app.use(cors({
    origin: ALLOWED_ORIGINS.split(','),
    credentials: true,
}));

app.use(cookieParser());
app.use(express.json());
app.use('/auth', authRoutes);

export default app;