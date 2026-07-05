# Beacon App

A full-stack starter template with a React client, Express server, and Docker setup.

The included demo is a simple message board that stores data in memory (no database required), so you can run the stack immediately and replace the UI and API as you build out Beacon.

## Prerequisites

- Docker

## Docker Setup

```bash
docker compose up --build
```

Then open your browser to `http://localhost:5173`

<details>
<summary>NPM Setup (no Docker)</summary>

**Prerequisites:** Node.js (v16 or higher) and npm or yarn

1. Install dependencies for both client and server:

```bash
npm run install:all
```

2. Start the server (runs on port 3000):

```bash
cd server
npm run server
```

3. In a new terminal, start the client (runs on port 5173):

```bash
cd client
npm run dev
```

4. Open your browser to `http://localhost:5173`

</details>

## Project Structure

```
beacon-app/
├── client/     # React + TypeScript + Vite frontend
├── server/     # Express API server
└── docker-compose.yml
```

## Demo Features

- Messages stored in memory (no database required)
- Client-server communication over REST
- Hot reload for the client in Docker
