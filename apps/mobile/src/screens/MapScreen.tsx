/**
 * Live trek map. Shows the tourist's current location, GPS track trail,
 * and an SOS button fixed to the bottom-right corner.
 *
 * MapView uses react-native-maps (Google Maps on Android, Apple Maps on iOS).
 * A Mapbox token is exposed via EXPO_PUBLIC_MAPBOX_TOKEN for any Mapbox-specific
 * features added later (terrain layers, offline maps).
 */

import React, { useEffect, useState } from "react";
import {
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from "react-native-maps";
import type { GpsPoint } from "@nepal-journey/types";
import { useGpsTracking } from "@/hooks/useGpsTracking";
import { triggerSos } from "@/api/client";

export default function MapScreen() {
  const { tracking, error, startTracking, stopTracking, queueLength } = useGpsTracking();
  const [trail, setTrail] = useState<GpsPoint[]>([]);
  const [current, setCurrent] = useState<GpsPoint | null>(null);
  const [sosLoading, setSosLoading] = useState(false);

  useEffect(() => {
    if (error) Alert.alert("GPS Error", error);
  }, [error]);

  const handleSos = async () => {
    if (!current) {
      Alert.alert("Location unavailable", "Enable GPS tracking before sending an SOS.");
      return;
    }
    Alert.alert(
      "Send SOS?",
      "This will alert the Nepal Tourism Board and emergency services with your current location.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Send SOS",
          style: "destructive",
          onPress: async () => {
            setSosLoading(true);
            try {
              await triggerSos(
                {
                  latitude: current.latitude,
                  longitude: current.longitude,
                  altitude_meters: current.altitude_meters,
                },
                "SOS from Nepal Journey app"
              );
              Alert.alert("SOS Sent", "Emergency services have been notified.");
            } catch (e) {
              Alert.alert("Error", e instanceof Error ? e.message : "SOS failed");
            } finally {
              setSosLoading(false);
            }
          },
        },
      ]
    );
  };

  const initialRegion = {
    latitude: 27.9881,
    longitude: 86.925,
    latitudeDelta: 0.5,
    longitudeDelta: 0.5,
  };

  return (
    <View style={styles.root}>
      <MapView
        style={StyleSheet.absoluteFillObject}
        provider={PROVIDER_GOOGLE}
        initialRegion={initialRegion}
        showsUserLocation
        showsMyLocationButton
      >
        {trail.length > 1 && (
          <Polyline
            coordinates={trail.map((p) => ({ latitude: p.latitude, longitude: p.longitude }))}
            strokeColor="#DC143C"
            strokeWidth={3}
          />
        )}
        {current && (
          <Marker
            coordinate={{ latitude: current.latitude, longitude: current.longitude }}
            title="You"
            pinColor="#003893"
          />
        )}
      </MapView>

      {/* Tracking toggle */}
      <View style={styles.topBar}>
        <TouchableOpacity
          style={[styles.trackBtn, tracking ? styles.trackBtnActive : {}]}
          onPress={tracking ? stopTracking : () => void startTracking()}
        >
          <Text style={styles.trackBtnText}>
            {tracking ? `Tracking ● (${queueLength > 0 ? `${queueLength} queued` : "live"})` : "Start Tracking"}
          </Text>
        </TouchableOpacity>
      </View>

      {/* SOS button */}
      <TouchableOpacity
        style={[styles.sosBtn, sosLoading && styles.sosBtnLoading]}
        onPress={() => void handleSos()}
        disabled={sosLoading}
      >
        <Text style={styles.sosBtnText}>{sosLoading ? "..." : "SOS"}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  topBar: {
    position: "absolute",
    top: 50,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  trackBtn: {
    backgroundColor: "rgba(0,0,0,0.65)",
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 8,
  },
  trackBtnActive: { backgroundColor: "rgba(0,56,147,0.85)" },
  trackBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  sosBtn: {
    position: "absolute",
    bottom: 36,
    right: 20,
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#DC143C",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#DC143C",
    shadowOpacity: 0.5,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  sosBtnLoading: { opacity: 0.6 },
  sosBtnText: { color: "#fff", fontWeight: "900", fontSize: 16, letterSpacing: 1 },
});
