import express from 'express';
import cors from 'cors';
import scenariosRouter from './routes/scenarios';
import { sessionsRouter } from './routes/sessions';
import { tracesRouter } from './routes/traces';
import { loadScenarioCards } from './scenarios/registry';

interface Message {
	id: number;
	name: string;
	message: string;
	timestamp: Date;
}

const app = express();

app.use(cors());
app.use(express.json());

loadScenarioCards();

app.use('/api/scenarios', scenariosRouter);
app.use('/api/sessions', sessionsRouter);
app.use('/api/traces', tracesRouter);

let messages: Message[] = [];
let nextId = 1;

app.get('/messages', (req, res) => {
	res.json(messages);
});

app.post('/messages', (req, res) => {
	const { name, message } = req.body;

	if (!name || !message) {
		return res.status(400).json({ error: 'Name and message are required' });
	}

	const newMessage: Message = {
		id: nextId++,
		name,
		message,
		timestamp: new Date(),
	};

	messages.push(newMessage);
	res.status(201).json(newMessage);
});

export default app;
