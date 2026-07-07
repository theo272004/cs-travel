/**
 * options.js
 * =============================================================================
 * Listas de opciones para los comboboxes buscables (ver components/Combobox.js):
 * nacionalidades y ciudades (formato "Ciudad, País", como los buscadores de
 * viajes). Aceptan valor libre; la lista solo sugiere.
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

// Ciudad, País (como los sitios de vuelos: se elige de la lista o se escribe libre).
export const CITIES = [
  // Colombia
  'Bogotá, Colombia', 'Medellín, Colombia', 'Cali, Colombia', 'Barranquilla, Colombia',
  'Cartagena, Colombia', 'Bucaramanga, Colombia', 'Santa Marta, Colombia', 'Pereira, Colombia',
  'Cúcuta, Colombia', 'San Andrés, Colombia', 'Armenia, Colombia', 'Manizales, Colombia',
  // Latinoamérica
  'Ciudad de Panamá, Panamá', 'San José, Costa Rica', 'Lima, Perú', 'Quito, Ecuador',
  'Guayaquil, Ecuador', 'Caracas, Venezuela', 'Santiago, Chile', 'Buenos Aires, Argentina',
  'Montevideo, Uruguay', 'São Paulo, Brasil', 'Río de Janeiro, Brasil', 'Ciudad de México, México',
  'Cancún, México', 'Ciudad de Guatemala, Guatemala', 'La Habana, Cuba', 'Punta Cana, Rep. Dominicana',
  'Santo Domingo, Rep. Dominicana', 'San Juan, Puerto Rico',
  // Norteamérica
  'Miami, Estados Unidos', 'Orlando, Estados Unidos', 'Nueva York, Estados Unidos',
  'Los Ángeles, Estados Unidos', 'Houston, Estados Unidos', 'Chicago, Estados Unidos',
  'Las Vegas, Estados Unidos', 'Washington D.C., Estados Unidos', 'Toronto, Canadá', 'Montreal, Canadá',
  // Europa / otros
  'Madrid, España', 'Barcelona, España', 'Lisboa, Portugal', 'París, Francia', 'Londres, Reino Unido',
  'Roma, Italia', 'Milán, Italia', 'Ámsterdam, Países Bajos', 'Fráncfort, Alemania',
  'Estambul, Turquía', 'Dubái, Emiratos Árabes',
];

export const COMBO_LISTS = { nationalities: NATIONALITIES, cities: CITIES };
