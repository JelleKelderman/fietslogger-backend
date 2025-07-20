const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));

let allData = []; // tijdelijk alle data opslaan (kan in database)

app.post('/upload', (req, res) => {
  const newData = req.body;
  console.log('Nieuwe data ontvangen:', newData.length);

  // Voeg nieuwe data toe aan opslag
  allData = allData.concat(newData);

  res.json({ message: 'Data ontvangen', received: newData.length, totalStored: allData.length });
});

app.get('/data', (req, res) => {
  res.json(allData);
});

app.listen(PORT, () => {
  console.log(`Server draait op http://localhost:${PORT}`);
});
