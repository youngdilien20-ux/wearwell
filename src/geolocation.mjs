const GEOLOCATION_OPTIONS = Object.freeze({
  enableHighAccuracy: false,
  maximumAge: 300_000,
  timeout: 10_000,
});

export function normalizeBrowserLocation(coords) {
  const latitude = Number(coords?.latitude);
  const longitude = Number(coords?.longitude);
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    throw new Error("The browser returned invalid location coordinates.");
  }

  return {
    latitude: Number(latitude.toFixed(2)),
    longitude: Number(longitude.toFixed(2)),
  };
}

export function getBrowserLocation(geolocation = globalThis.navigator?.geolocation) {
  if (typeof geolocation?.getCurrentPosition !== "function") {
    const error = new Error("Location is not available in this browser.");
    error.code = "UNSUPPORTED";
    return Promise.reject(error);
  }

  return new Promise((resolve, reject) => {
    geolocation.getCurrentPosition(
      (position) => {
        try {
          resolve(normalizeBrowserLocation(position?.coords));
        } catch (error) {
          reject(error);
        }
      },
      reject,
      GEOLOCATION_OPTIONS,
    );
  });
}