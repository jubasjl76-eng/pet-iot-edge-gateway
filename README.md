# Pet IoT Edge Gateway

An edge gateway service that runs locally in a kennel or pet owner's network, acting as a bridge between IoT devices and the cloud backend.

## Architecture Role

```
IoT Devices → Local MQTT → Edge Gateway → Backend API (sync)
                                    ↓
                              SQLite (offline queue)
```

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
└─────────────┘     │ (MQTT +    │     │ (PostgreSQL)│
                    │  SQLite)   │     └─────────────┘
                    └─────────────┘
```

## MQTT Topics

### Subscribe (from devices)
```
kennel/{kennelId}/sensor/{deviceId}/temperature
kennel/{kennelId}/sensor/{deviceId}/humidity
kennel/{kennelId}/door/{deviceId}/status
kennel/{kennelId}/feeder/{deviceId}/status
kennel/{kennelId}/water/{deviceId}/status
kennel/{kennelId}/camera/{deviceId}/status
```

### Publish (to devices)
```
kennel/{kennelId}/{deviceType}/{deviceId}/command
```

## QoS Levels

- **QoS 1**: Sensor events (at least once delivery)
- **QoS 2**: Commands (exactly once delivery)

## Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| GATEWAY_ID | Unique gateway ID | auto-generated |
| KENNEL_ID | Kennel identifier | kennel-01 |
| MQTT_HOST | Local MQTT broker | localhost |
| MQTT_PORT | MQTT port | 1883 |
| LOCAL_BACKEND_URL | Local backend URL | http://localhost:3000 |
| CLOUD_BACKEND_URL | Cloud backend URL | - |
| API_KEY | Backend API key | smart-pet-api-key-2026 |
| SQLITE_PATH | Database path | ./data/gateway.db |
| SYNC_INTERVAL | Sync interval (ms) | 30000 |

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

## Offline Mode

When internet is unavailable:
1. Events are stored in SQLite
2. Commands are queued
3. When connection restored, automatically syncs

## API Endpoints (local)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /health | Health check |
| GET /devices | List registered devices |
| POST | /events | Submit event |
| GET | /events | Get events |
| POST | /commands | Send command |

## Integration

The edge gateway communicates with:
- **Local MQTT Broker**: Receives device events
- **Backend API**: Syncs events via `POST /api/devices/ingest`

## File Structure

```
src/
├── mqtt/          # MQTT client
├── devices/       # Device management
├── storage/      # SQLite storage
├── sync/         # Backend sync service
├── api/          # Local API
├── config/       # Configuration
└── index.ts      # Entry point
```

## License

MIT
