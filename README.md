# Pet IoT Edge Gateway

An edge gateway service that runs locally in a kennel or pet owner's network, acting as a bridge between IoT devices and the cloud backend.

## Features

- 📡 **Local MQTT Broker** - Devices connect to local MQTT
- 💾 **SQLite Storage** - Stores events locally when offline
- 🔄 **Auto-Sync** - Syncs with backend when internet available
- 📱 **Offline Queue** - Queues events when offline
- 🔔 **Command Relay** - Forwards commands to devices
- ❤️ **Heartbeat Monitoring** - Tracks device health

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│ IoT Devices │────▶│ Edge       │────▶│ Cloud       │
│ (ESP32, etc)│     │ Gateway    │     │ Backend     │
└─────────────┘     │ (MQTT +    │     │ (MongoDB)   │
                    │  SQLite)   │     └─────────────┘
                    └─────────────┘
```

## Quick Start

### 1. Clone & Install

```bash
git clone https://github.com/jubasjl76-eng/pet-iot-edge-gateway.git
cd pet-iot-edge-gateway
npm install
```

### 2. Configure

```bash
cp .env.example .env
# Edit .env with your settings
```

### 3. Run

```bash
npm run dev
```

### 4. Docker

```bash
docker-compose up -d
```

## Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| GATEWAY_ID | Unique gateway ID | auto-generated |
| KENNEL_ID | Kennel identifier | kennel-01 |
| MQTT_HOST | Local MQTT broker | localhost |
| MQTT_PORT | MQTT port | 1883 |
| API_URL | Backend API URL | http://localhost:3000 |
| API_KEY | Backend API key | smart-pet-api-key-2026 |
| SQLITE_PATH | Database path | ./data/gateway.db |
| SYNC_INTERVAL | Sync interval (ms) | 30000 |

## MQTT Topics

### Subscribe (from devices)
```
kennel/{kennelId}/{deviceType}/{deviceId}/status
kennel/{kennelId}/{deviceType}/{deviceId}/event
kennel/{kennelId}/{deviceType}/{deviceId}/heartbeat
```

### Publish (to devices)
```
kennel/{kennelId}/{deviceType}/{deviceId}/command
```

## API Endpoints (local)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /health | Health check |
| GET /devices | List registered devices |
| POST | /events | Submit event |
| GET | /events | Get events |
| POST | /commands | Send command |

## Offline Mode

When internet is unavailable:
1. Events are stored in SQLite
2. Commands are queued
3. When connection restored, automatically syncs

## License

MIT
