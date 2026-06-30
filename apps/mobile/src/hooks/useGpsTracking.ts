/**
 * GPS tracking hook with offline queue.
 *
 * When online: sends each point immediately via POST /tracking/gps.
 * When offline: accumulates points in the queue; flushes when connectivity returns.
 * The tourist must have given tracking consent (tracked server-side via RLS) before
 * calling startTracking — the API will 403 otherwise.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import * as Location from "expo-location";
import type { GpsPoint } from "@nepal-journey/types";
import { sendGpsPoint, flushGpsQueue } from "@/api/client";

const INTERVAL_MS = 30_000;

export function useGpsTracking() {
  const [tracking, setTracking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const queue = useRef<GpsPoint[]>([]);
  const subscription = useRef<Location.LocationSubscription | null>(null);

  const onLocation = useCallback(async (loc: Location.LocationObject) => {
    const point: GpsPoint = {
      latitude: loc.coords.latitude,
      longitude: loc.coords.longitude,
      altitude_meters: loc.coords.altitude ?? undefined,
      accuracy_meters: loc.coords.accuracy ?? undefined,
      recorded_at: new Date(loc.timestamp).toISOString(),
    };

    // Try immediate send; fall back to queue on failure
    try {
      if (queue.current.length > 0) {
        // Flush queue first if there's a backlog
        await flushGpsQueue([...queue.current, point]);
        queue.current = [];
      } else {
        await sendGpsPoint(point);
      }
    } catch {
      queue.current.push(point);
    }
  }, []);

  const startTracking = useCallback(async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") {
      setError("Location permission denied");
      return;
    }
    subscription.current = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.High,
        timeInterval: INTERVAL_MS,
        distanceInterval: 10,
      },
      (loc) => void onLocation(loc)
    );
    setTracking(true);
    setError(null);
  }, [onLocation]);

  const stopTracking = useCallback(() => {
    subscription.current?.remove();
    subscription.current = null;
    setTracking(false);
    // Flush any remaining queued points on stop
    if (queue.current.length > 0) {
      void flushGpsQueue(queue.current).catch(() => {/* will retry next session */});
      queue.current = [];
    }
  }, []);

  useEffect(() => {
    return () => {
      subscription.current?.remove();
    };
  }, []);

  return { tracking, error, startTracking, stopTracking, queueLength: queue.current.length };
}
