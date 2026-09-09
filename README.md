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
| SQLITE_PATH | Database path (`:memory:` for tests) | ./data/gateway.db |
| SYNC_INTERVAL | Legacy HTTP sync interval (ms) | 30000 |
| HTTP_PORT | Local Pet Hub HTTP API port | 3004 |
| SCHEDULE_TICK_INTERVAL | Local schedule runner interval (ms); 0 disables | 30000 |
| CLOUD_MQTT_URL | Cloud broker for the bridge (unset = no bridge) | - |
| CLOUD_MQTT_USERNAME / CLOUD_MQTT_PASSWORD | Cloud broker creds | - |
| HTTP_SYNC_ENABLED | Re-enable legacy `/api/iot/*` HTTP sync | false |

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

## Local HTTP API (Pet Hub, default `:3004`)

Runs on the LAN so the owner app / staff dashboard reach devices even with no
internet. Built on Node's `http` module — no extra runtime dependency.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | liveness (also the Docker healthcheck) |
| GET | `/status` | gateway + MQTT + queue summary |
| GET | `/devices` | known devices |
| GET | `/events?deviceId=&limit=` | recent events (unsynced first if no `deviceId`) |
| GET | `/schedules?deviceId=` | local schedules |
| POST | `/schedules` | `{deviceId,deviceType,time:"HH:MM",amount,enabled,daysOfWeek?}` |
| PUT | `/schedules/:id` | update |
| DELETE | `/schedules/:id` | remove |
| POST | `/commands` | `{deviceId,deviceType,command,params}` → queued, then delivered over MQTT + tracked to its ack |
| GET | `/commands` | recent queued commands + ack results |

## Pet Hub behaviour

- **Local schedule runner** — the hub fires `feed` / `dispense` commands on the
  LAN wall-clock every `SCHEDULE_TICK_INTERVAL` ms, **cloud or no cloud**. Schedules
  live in SQLite (`schedules` table); a 5-minute window tolerates a missed tick and
  a 30-minute de-dup prevents double feeds.
- **LAN command queue** — `POST /commands` enqueues; the runner delivers to the
  device over MQTT with a correlation `id` and resolves it when the device's
  `ack` arrives. Works with the internet down.
- **Canonical v2 topics** — `kennel/{kennelId}/{deviceType}/{deviceId}/{leaf}` with
  `leaf ∈ status|command|event|ack|telemetry|location|presence|<metric>`
  (mirrors `smart-pet-mqtt`; see `src/protocol.ts`). The old `…/heartbeat` leaf is
  still tolerated during migration.
- **Cloud MQTT bridge** (optional) — set `CLOUD_MQTT_URL` and the hub mirrors
  `kennel/{kennelId}/#` to a cloud broker (state up) and cloud commands down,
  loop-safe. This is how a home hub reaches `smart-pet-backend` (which consumes
  MQTT, not HTTP).
- **Legacy HTTP sync** to `/api/iot/*` is **off by default** (`HTTP_SYNC_ENABLED=true`
  to re-enable) — the cloud backend consumes MQTT directly now.

## Integration

- **Local MQTT broker** — device state/telemetry in, commands out
- **Cloud** — via the MQTT bridge (`CLOUD_MQTT_URL`), or legacy HTTP sync

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
