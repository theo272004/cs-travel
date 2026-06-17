/**
 * travelService.js
 * =============================================================================
 * PROPOSITO:
 *   Buscar inventario REAL de viajes (vuelos y hoteles) para armar el costo
 *   base de un caso. En el portal desplegado habla con los endpoints del sitio
 *   (/api/travel/*) que por detras consultan Amadeus con la clave secreta del
 *   servidor. En local/demo usa datos de ejemplo para que la pantalla funcione
 *   sin backend.
 *
 *   Igual que apiService, NO expone claves al navegador: toda credencial vive
 *   en el servidor. Aqui solo se reciben resultados ya simplificados.
 *
 *   Respuesta siempre: { source: 'live' | 'demo', data: [...] }.
 * =============================================================================
 */

import { isDeployedBundle } from '../utils/env.js';

function qs(params) {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') sp.set(k, String(v));
  });
  return sp.toString();
}

async function http(path) {
  const res = await fetch(`/api/travel${path}`, { credentials: 'same-origin' });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error((data && data.error) || `Error ${res.status} al consultar inventario`);
  return data;
}

export const travelService = {
  async locations(keyword) {
    if (isDeployedBundle()) return http(`/locations?${qs({ keyword })}`);
    return { source: 'demo', data: mockLocations(keyword) };
  },

  async flights(args) {
    if (isDeployedBundle()) return http(`/flights?${qs(args)}`);
    return { source: 'demo', data: mockFlights(args) };
  },

  async hotels(args) {
    if (isDeployedBundle()) return http(`/hotels?${qs(args)}`);
    return { source: 'demo', data: mockHotels(args) };
  },
};

/* ---------------------------------------------------------------------------
 * Datos de ejemplo (solo modo local/demo). Misma forma que el backend real.
 * ------------------------------------------------------------------------- */
const DEMO_CITIES = [
  { iataCode: 'BOG', name: 'El Dorado', cityName: 'Bogota', countryName: 'Colombia', subType: 'CITY' },
  { iataCode: 'MDE', name: 'Rionegro', cityName: 'Medellin', countryName: 'Colombia', subType: 'CITY' },
  { iataCode: 'MEX', name: 'Benito Juarez', cityName: 'Ciudad de Mexico', countryName: 'Mexico', subType: 'CITY' },
  { iataCode: 'LIM', name: 'Jorge Chavez', cityName: 'Lima', countryName: 'Peru', subType: 'CITY' },
  { iataCode: 'MIA', name: 'Miami Intl', cityName: 'Miami', countryName: 'Estados Unidos', subType: 'CITY' },
  { iataCode: 'MAD', name: 'Barajas', cityName: 'Madrid', countryName: 'Espana', subType: 'CITY' },
];
const DEMO_AIRLINES = ['Avianca', 'LATAM', 'Copa Airlines', 'Wingo'];

function seed(str) {
  let h = 2166136261;
  for (let i = 0; i < String(str).length; i++) {
    h ^= String(str).charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function resolveDemoIata(text) {
  const clean = String(text || '').trim();
  if (/^[A-Za-z]{3}$/.test(clean)) return clean.toUpperCase();
  const k = clean.toLowerCase();
  const hit = DEMO_CITIES.find((c) => c.cityName.toLowerCase().includes(k));
  return hit ? hit.iataCode : clean.slice(0, 3).toUpperCase();
}

function mockLocations(keyword) {
  const k = String(keyword || '').trim().toLowerCase();
  if (!k) return DEMO_CITIES.slice(0, 6);
  return DEMO_CITIES.filter(
    (c) => c.cityName.toLowerCase().includes(k) || c.iataCode.toLowerCase().includes(k),
  );
}

function mockFlights(args) {
  const origin = resolveDemoIata(args.origin);
  const destination = resolveDemoIata(args.destination);
  const adults = Number(args.adults) || 1;
  const rnd = seed(`${origin}${destination}${args.departureDate}${args.returnDate || ''}`);
  const out = [];
  for (let i = 0; i < 5; i++) {
    const airline = DEMO_AIRLINES[Math.floor(rnd() * DEMO_AIRLINES.length)];
    const stops = rnd() > 0.6 ? 1 : 0;
    const durH = 2 + Math.floor(rnd() * 8) + stops * 2;
    const perAdult = 180 + Math.floor(rnd() * 600) + stops * 40;
    const price = Math.round(perAdult * adults * (args.returnDate ? 1.9 : 1));
    out.push({
      id: `demo-fl-${i + 1}`,
      price,
      currency: args.currency || 'USD',
      airline,
      seatsLeft: 1 + Math.floor(rnd() * 9),
      outbound: { from: origin, to: destination, departAt: `${args.departureDate}T08:00:00`, arriveAt: `${args.departureDate}T12:00:00`, stops, durationLabel: `${durH}h`, airline },
      inbound: args.returnDate
        ? { from: destination, to: origin, departAt: `${args.returnDate}T15:00:00`, arriveAt: `${args.returnDate}T19:00:00`, stops, durationLabel: `${durH}h`, airline }
        : null,
    });
  }
  return out.sort((a, b) => a.price - b.price);
}

function mockHotels(args) {
  const names = ['Hotel Plaza Central', 'Suites Bienestar', 'Gran Hotel Recuperacion', 'City Express Premium', 'Hotel Boutique Salud'];
  const rooms = ['Habitacion estandar', 'Suite junior', 'Habitacion superior'];
  const a = Date.parse(args.checkInDate);
  const b = Date.parse(args.checkOutDate);
  const nights = a && b && b > a ? Math.max(1, Math.round((b - a) / 86400000)) : 3;
  const rnd = seed(`${args.cityCode || args.city}${args.checkInDate}${args.checkOutDate}`);
  return names
    .map((name, i) => ({
      id: `demo-ho-${i + 1}`,
      name,
      price: (45 + Math.floor(rnd() * 170)) * nights,
      currency: args.currency || 'USD',
      nights,
      roomType: rooms[Math.floor(rnd() * rooms.length)],
      cityCode: resolveDemoIata(args.cityCode || args.city),
    }))
    .sort((x, y) => x.price - y.price);
}
