import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, Button, FlatList, Alert } from 'react-native';
import * as Location from 'expo-location';
import { Accelerometer } from 'expo-sensors';
import { StatusBar } from 'expo-status-bar';
import { LineChart } from 'react-native-chart-kit';

const WS_URL = 'wss://websocket-server-production-d0da.up.railway.app/';

export default function App() {
  const [recording, setRecording] = useState(false);
  const [data, setData] = useState([]);
  const [latestLocation, setLatestLocation] = useState(null);
  const locationSub = useRef(null);
  const accelSub = useRef(null);
  const latestLocationRef = useRef(null);
  const dataRef = useRef([]);
  const ws = useRef(null);

  // Hou refs up-to-date
  useEffect(() => {
    latestLocationRef.current = latestLocation;
  }, [latestLocation]);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  // WebSocket setup
  useEffect(() => {
    ws.current = new WebSocket(WS_URL);

    ws.current.onopen = () => {
      console.log('WebSocket verbinding open');
    };

    ws.current.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data);
        if (Array.isArray(parsed)) {
          setData((prev) => [...prev, ...parsed]);
        }
      } catch (e) {
        console.error('Fout bij parsen WebSocket bericht:', e);
      }
    };

    ws.current.onerror = (error) => {
      console.error('WebSocket fout:', error.message);
    };

    ws.current.onclose = (event) => {
      console.log('WebSocket connectie gesloten:', event.code, event.reason);
    };

    return () => {
      if (ws.current.readyState === WebSocket.OPEN) {
        ws.current.close();
      }
    };
  }, []);

  // Locatie & accelerometer verzamelen
  useEffect(() => {
    if (!recording) {
      if (locationSub.current) locationSub.current.remove();
      if (accelSub.current) accelSub.current.remove();
      locationSub.current = null;
      accelSub.current = null;
      return;
    }

    (async () => {
      const { status: locStatus } = await Location.requestForegroundPermissionsAsync();
      if (locStatus !== 'granted') {
        alert('Location permission not granted');
        setRecording(false);
        return;
      }

      locationSub.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Highest, timeInterval: 1000, distanceInterval: 1 },
        (location) => {
          setLatestLocation({
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
          });
          // Voeg locatie toe met null acceleratie voorlopig
          setData(prev => [...prev, {
            timestamp: Date.now(),
            location: {
              latitude: location.coords.latitude,
              longitude: location.coords.longitude,
            },
            total_accel: null,
          }]);
        }
      );
    })();

    Accelerometer.setUpdateInterval(20);
    accelSub.current = Accelerometer.addListener(accelData => {
      const totalAccel = Math.sqrt(accelData.x ** 2 + accelData.y ** 2 + accelData.z ** 2);
      setData(prev => [...prev, {
        timestamp: Date.now(),
        location: latestLocationRef.current,
        total_accel: totalAccel,
      }]);
    });

    return () => {
      if (locationSub.current) locationSub.current.remove();
      if (accelSub.current) accelSub.current.remove();
    };
  }, [recording]);

  // Data iedere 30 seconden via WebSocket verzenden
  useEffect(() => {
    if (!recording) return;

    const interval = setInterval(() => {
      if (dataRef.current.length === 0 || !ws.current || ws.current.readyState !== WebSocket.OPEN) return;

      const payload = JSON.stringify({ type: 'data', payload: dataRef.current });
      ws.current.send(payload);
      setData([]);
    }, 30000);

    return () => clearInterval(interval);
  }, [recording]);

  const toggleRecording = async () => {
    if (recording) {
      // Stuur laatste data voor stoppen
      if (dataRef.current.length > 0) {
        if (ws.current && ws.current.readyState === WebSocket.OPEN) {
          ws.current.send(JSON.stringify({ type: 'data', payload: dataRef.current }));
          setData([]);
        } else {
          Alert.alert('Fout', 'WebSocket is niet verbonden.');
          return;
        }
      }

      // Stuur stop bericht
      try {
        if (ws.current && ws.current.readyState === WebSocket.OPEN) {
          ws.current.send(JSON.stringify({ type: 'stop' }));
        }

        // Je kunt ook nog de REST endpoint /stop aanroepen voor CSV opslaan
        const response = await fetch('https://websocket-server-production-d0da.up.railway.app/stop', { method: 'POST' });
        if (response.ok) {
          const result = await response.json();
          Alert.alert('Succes', 'Rit opgeslagen en CSV gegenereerd!');
          console.log('CSV download link:', `https://websocket-server-production-d0da.up.railway.app${result.downloadURL}`);
        } else {
          const text = await response.text();
          Alert.alert('Fout', text || 'Stoppen mislukt');
        }
      } catch (e) {
        Alert.alert('Fout', 'Er is een fout opgetreden bij stoppen.');
      }

      setRecording(false);
    } else {
      setData([]);
      setRecording(true);
    }
  };

  const accelData = data
    .filter(item => typeof item.total_accel === 'number')
    .map(item => ({
      time: (item.timestamp - data[0]?.timestamp) / 1000,
      total: item.total_accel,
    }));

  const accelValues = accelData.map(d => d.total);

  const resetData = () => {
    setData([]);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Fietslogger</Text>
      <Button
        title={recording ? "Stop Recording & stuur CSV naar backend" : "Start Recording"}
        onPress={toggleRecording}
      />
      <Button title="Reset Data" onPress={resetData} />

      {accelValues.length > 0 && (
        <View style={{ marginVertical: 20 }}>
          <LineChart
            data={{
              labels: accelData.map(d => d.time.toFixed(0)),
              datasets: [{ data: accelValues }],
            }}
            width={350}
            height={200}
            yAxisSuffix=""
            chartConfig={{
              backgroundColor: "#fff",
              backgroundGradientFrom: "#fff",
              backgroundGradientTo: "#fff",
              decimalPlaces: 2,
              color: (opacity = 1) => `rgba(134, 65, 244, ${opacity})`,
              labelColor: (opacity = 1) => `rgba(0,0,0,${opacity})`,
              style: { borderRadius: 16 },
              propsForDots: { r: "2", strokeWidth: "1", stroke: "#ffa726" },
            }}
            bezier
            style={{ borderRadius: 8 }}
          />
          <Text style={{ textAlign: 'center' }}>Tijd (seconden) op X-as, Totale acceleratie op Y-as</Text>
        </View>
      )}

      <FlatList
        data={data.filter(item => item.total_accel !== undefined).slice(-10).reverse()}
        keyExtractor={(_, i) => i.toString()}
        renderItem={({ item }) => (
          <View style={styles.item}>
            <Text>Tijd: {new Date(item.timestamp).toLocaleTimeString()}</Text>
            <Text>Locatie: {item.location ? `${item.location.latitude.toFixed(5)}, ${item.location.longitude.toFixed(5)}` : 'N/A'}</Text>
            <Text>Totale acceleratie: {item.total_accel?.toFixed(2)}</Text>
          </View>
        )}
      />

      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', paddingTop: 40, paddingHorizontal: 10 },
  title: { fontSize: 24, marginBottom: 20, textAlign: 'center' },
  item: { borderBottomWidth: 1, borderBottomColor: '#eee', paddingVertical: 8 },
});
