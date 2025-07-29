import express from 'express';
import path from 'path';
import fs from 'fs';
import cors from 'cors';
import bodyParser from 'body-parser';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';
import http from 'http';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));

let currentRide = [];
let rideHistory = [];

// --- WebSocket Setup ---
const clientsWS = new Set();

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws/events' });

wss.on('connection', (ws) => {
  clientsWS.add(ws);
  console.log('📡 Client verbonden via WebSocket');

  ws.on('close', () => {
    clientsWS.delete(ws);
    console.log('❌ WebSocket verbinding gesloten');
  });
});

function broadcastToWSClients(data) {
  const payload = JSON.stringify(data);
  clientsWS.forEach(client => {
    if (client.readyState === client.OPEN) {
      client.send(payload);
    }
  });
}
// --- Einde WebSocket Setup ---

app.post('/upload', (req, res) => {
  const newData = req.body;

  if (!Array.isArray(newData)) {
    return res.status(400).json({ message: 'Data moet een array zijn' });
  }

  console.log(`Ontvangen ${newData.length} datapunten`);
  currentRide = currentRide.concat(newData);

  // Stuur nieuwe data naar frontend via WebSocket
  broadcastToWSClients(newData);

  res.json({ message: 'Data ontvangen', totaal: currentRide.length });
});

app.post('/stop', (req, res) => {
  if (currentRide.length === 0) {
    return res.status(400).json({ message: 'Geen data om op te slaan' });
  }

  console.log('Stopping ride, currentRide length:', currentRide.length);

  rideHistory.push(currentRide);
  const index = rideHistory.length - 1;

  const csv = convertToCSV(currentRide);
  const filename = `ride_${index + 1}.csv`;
  const filePath = path.join(__dirname, 'csv_exports', filename);

  fs.mkdirSync(path.join(__dirname, 'csv_exports'), { recursive: true });

  try {
    fs.writeFileSync(filePath, csv);
    console.log(`CSV file geschreven: ${filename}, grootte: ${csv.length} bytes`);
  } catch (e) {
    console.error('Fout bij schrijven CSV:', e);
    return res.status(500).json({ message: 'Fout bij opslaan CSV' });
  }

  analyzeRide(currentRide);

  currentRide = [];

  res.json({ message: 'Rit opgeslagen en geanalyseerd', index, downloadURL: `/csv/${index}` });
});

app.get('/csv/:rideIndex', (req, res) => {
  const index = parseInt(req.params.rideIndex);
  const filename = `ride_${index + 1}.csv`;
  const filePath = path.join(__dirname, 'csv_exports', filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ message: 'CSV niet gevonden' });
  }

  res.download(filePath, filename);
});

function analyzeRide(rideData) {
  const accelValues = rideData
    .filter(d => typeof d.total_accel === 'number')
    .map(d => d.total_accel);

  if (accelValues.length === 0) return console.log('Geen acceleratie-data');

  const gemiddelde = accelValues.reduce((a, b) => a + b, 0) / accelValues.length;
  const max = Math.max(...accelValues);
  const min = Math.min(...accelValues);

  console.log('--- Analyse van rit ---');
  console.log(`Punten: ${rideData.length}`);
  console.log(`Gemiddelde accel: ${gemiddelde.toFixed(2)}`);
  console.log(`Max accel: ${max.toFixed(2)}`);
  console.log(`Min accel: ${min.toFixed(2)}`);
}

function convertToCSV(data) {
  const header = 'timestamp,latitude,longitude,total_accel\n';
  const rows = data.map(item => {
    const lat = item.location?.latitude ?? '';
    const lon = item.location?.longitude ?? '';
    const total = typeof item.total_accel === 'number' ? item.total_accel : '';
    return `${item.timestamp},${lat},${lon},${total}`;
  });
  return header + rows.join('\n');
}

server.listen(PORT, () => {
  console.log(`🚴 Backend draait op http://localhost:${PORT}`);
  console.log(`📡 WebSocket actief op ws://localhost:${PORT}/ws/events`);
});
