import dotenv from 'dotenv';
import express, { Express } from 'express';
import { Display } from './display';
dotenv.config();

const app: Express = express();
const port = process.env.PORT || 3000;

app.use((_, res) => {
  res.status(200).send('Hello, world!');
});

app.listen(port, () => {
  console.log(`[server]: Server is running at http://localhost:${port}`);
});

const display = new Display();
