/**
 * options.js
 * =============================================================================
 * Listas de opciones para los campos con "lista buscable" (typeahead nativo):
 * nacionalidad, ciudades (origen/destino) y nº de personas. Se exponen como
 * <datalist> globales (una sola vez en <body>) para que cualquier <input
 * list="..."> filtre mientras el usuario escribe, sin bloquear valores libres.
 * =============================================================================
 */

export const NATIONALITIES = [
  'Colombiana', 'Venezolana', 'Ecuatoriana', 'Peruana', 'Boliviana', 'Chilena',
  'Argentina', 'Uruguaya', 'Paraguaya', 'Brasileña', 'Mexicana', 'Guatemalteca',
  'Hondureña', 'Salvadoreña', 'Nicaragüense', 'Costarricense', 'Panameña',
  'Cubana', 'Dominicana', 'Puertorriqueña', 'Estadounidense', 'Canadiense',
  'Española', 'Portuguesa', 'Francesa', 'Italiana', 'Alemana', 'Británica',
  'Holandesa', 'Suiza', 'Belga', 'Sueca', 'Noruega', 'Rusa', 'China',
  'Japonesa', 'Coreana', 'India', 'Australiana', 'Sudafricana', 'Marroquí',
];

export const CITIES = [
  // Colombia
  'Bogotá', 'Medellín', 'Cali', 'Barranquilla', 'Cartagena', 'Bucaramanga',
  'Santa Marta', 'Pereira', 'Cúcuta', 'San Andrés', 'Armenia', 'Manizales',
  // Latam
  'Ciudad de Panamá', 'San José (Costa Rica)', 'Lima', 'Quito', 'Guayaquil',
  'Caracas', 'Santiago de Chile', 'Buenos Aires', 'Montevideo', 'São Paulo',
  'Río de Janeiro', 'Ciudad de México', 'Cancún', 'Guatemala', 'La Habana',
  'Punta Cana', 'Santo Domingo', 'San Juan (Puerto Rico)',
  // USA / Canadá
  'Miami', 'Orlando', 'Nueva York', 'Los Ángeles', 'Houston', 'Chicago',
  'Las Vegas', 'Washington D.C.', 'Toronto', 'Montreal',
  // Europa
  'Madrid', 'Barcelona', 'Lisboa', 'París', 'Londres', 'Roma', 'Milán',
  'Ámsterdam', 'Fráncfort', 'Estambul', 'Dubái',
];

export const PEOPLE_COUNTS = Array.from({ length: 20 }, (_, i) => String(i + 1));

const DATALISTS = [
  { id: 'dl-nationalities', items: NATIONALITIES },
  { id: 'dl-cities', items: CITIES },
  { id: 'dl-people', items: PEOPLE_COUNTS },
];

/** Inserta (una sola vez) los <datalist> compartidos en <body>. Idempotente. */
export function ensureSharedDatalists() {
  DATALISTS.forEach(({ id, items }) => {
    if (document.getElementById(id)) return;
    const dl = document.createElement('datalist');
    dl.id = id;
    dl.innerHTML = items.map((v) => `<option value="${v.replace(/"/g, '&quot;')}"></option>`).join('');
    document.body.appendChild(dl);
  });
}
