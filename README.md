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

**Prerequisites:** Node.js 22.x and npm 11.x

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

## Developer Quickstart

For a fast local development setup:

```bash
# install both server and client deps from the repo root
npm run install:all

# start the server in one terminal
cd server
npm run server

# start the client in another terminal
cd client
npm run dev
```

Then open `http://localhost:5173`.

If you need environment variables for the server, copy `server/.env.example` to `server/.env`.

The repository also includes an active CI workflow at `.github/workflows/ci.yml` that runs on pull requests and pushes to `main`.

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
