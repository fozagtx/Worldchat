export interface City { city: string; country: string; cc: string; lat: number; lng: number; tz: string }

// [city, country, lat, lng, tz]
const RAW: [string, string, number, number, string][] = [
  ["Abuja", "Nigeria", 9.06, 7.49, "Africa/Lagos"],
  ["Accra", "Ghana", 5.6, -0.19, "Africa/Accra"],
  ["Addis Ababa", "Ethiopia", 9.03, 38.74, "Africa/Addis_Ababa"],
  ["Amsterdam", "Netherlands", 52.37, 4.9, "Europe/Amsterdam"],
  ["Athens", "Greece", 37.98, 23.73, "Europe/Athens"],
  ["Atlanta", "United States", 33.75, -84.39, "America/New_York"],
  ["Auckland", "New Zealand", -36.85, 174.76, "Pacific/Auckland"],
  ["Bangkok", "Thailand", 13.76, 100.5, "Asia/Bangkok"],
  ["Barcelona", "Spain", 41.39, 2.17, "Europe/Madrid"],
  ["Beijing", "China", 39.9, 116.41, "Asia/Shanghai"],
  ["Bengaluru", "India", 12.97, 77.59, "Asia/Kolkata"],
  ["Berlin", "Germany", 52.52, 13.4, "Europe/Berlin"],
  ["Bogotá", "Colombia", 4.71, -74.07, "America/Bogota"],
  ["Boston", "United States", 42.36, -71.06, "America/New_York"],
  ["Buenos Aires", "Argentina", -34.6, -58.38, "America/Argentina/Buenos_Aires"],
  ["Cairo", "Egypt", 30.04, 31.24, "Africa/Cairo"],
  ["Cape Town", "South Africa", -33.92, 18.42, "Africa/Johannesburg"],
  ["Casablanca", "Morocco", 33.57, -7.59, "Africa/Casablanca"],
  ["Chicago", "United States", 41.88, -87.63, "America/Chicago"],
  ["Copenhagen", "Denmark", 55.68, 12.57, "Europe/Copenhagen"],
  ["Dakar", "Senegal", 14.72, -17.47, "Africa/Dakar"],
  ["Dar es Salaam", "Tanzania", -6.79, 39.21, "Africa/Dar_es_Salaam"],
  ["Delhi", "India", 28.61, 77.21, "Asia/Kolkata"],
  ["Denver", "United States", 39.74, -104.99, "America/Denver"],
  ["Dhaka", "Bangladesh", 23.81, 90.41, "Asia/Dhaka"],
  ["Dubai", "United Arab Emirates", 25.2, 55.27, "Asia/Dubai"],
  ["Dublin", "Ireland", 53.35, -6.26, "Europe/Dublin"],
  ["Helsinki", "Finland", 60.17, 24.94, "Europe/Helsinki"],
  ["Ho Chi Minh City", "Vietnam", 10.82, 106.63, "Asia/Ho_Chi_Minh"],
  ["Hong Kong", "Hong Kong", 22.32, 114.17, "Asia/Hong_Kong"],
  ["Honolulu", "United States", 21.31, -157.86, "Pacific/Honolulu"],
  ["Istanbul", "Türkiye", 41.01, 28.98, "Europe/Istanbul"],
  ["Jakarta", "Indonesia", -6.21, 106.85, "Asia/Jakarta"],
  ["Johannesburg", "South Africa", -26.2, 28.05, "Africa/Johannesburg"],
  ["Karachi", "Pakistan", 24.86, 67.0, "Asia/Karachi"],
  ["Kampala", "Uganda", 0.35, 32.58, "Africa/Kampala"],
  ["Kano", "Nigeria", 12.0, 8.52, "Africa/Lagos"],
  ["Kigali", "Rwanda", -1.94, 30.06, "Africa/Kigali"],
  ["Kinshasa", "DR Congo", -4.44, 15.27, "Africa/Kinshasa"],
  ["Kuala Lumpur", "Malaysia", 3.14, 101.69, "Asia/Kuala_Lumpur"],
  ["Lagos", "Nigeria", 6.52, 3.38, "Africa/Lagos"],
  ["Lima", "Peru", -12.05, -77.04, "America/Lima"],
  ["Lisbon", "Portugal", 38.72, -9.14, "Europe/Lisbon"],
  ["London", "United Kingdom", 51.51, -0.13, "Europe/London"],
  ["Los Angeles", "United States", 34.05, -118.24, "America/Los_Angeles"],
  ["Madrid", "Spain", 40.42, -3.7, "Europe/Madrid"],
  ["Manila", "Philippines", 14.6, 120.98, "Asia/Manila"],
  ["Melbourne", "Australia", -37.81, 144.96, "Australia/Melbourne"],
  ["Mexico City", "Mexico", 19.43, -99.13, "America/Mexico_City"],
  ["Miami", "United States", 25.76, -80.19, "America/New_York"],
  ["Milan", "Italy", 45.46, 9.19, "Europe/Rome"],
  ["Montréal", "Canada", 45.5, -73.57, "America/Toronto"],
  ["Moscow", "Russia", 55.76, 37.62, "Europe/Moscow"],
  ["Mumbai", "India", 19.08, 72.88, "Asia/Kolkata"],
  ["Nairobi", "Kenya", -1.29, 36.82, "Africa/Nairobi"],
  ["New York", "United States", 40.71, -74.01, "America/New_York"],
  ["Osaka", "Japan", 34.69, 135.5, "Asia/Tokyo"],
  ["Oslo", "Norway", 59.91, 10.75, "Europe/Oslo"],
  ["Paris", "France", 48.86, 2.35, "Europe/Paris"],
  ["Prague", "Czechia", 50.08, 14.44, "Europe/Prague"],
  ["Reykjavík", "Iceland", 64.15, -21.94, "Atlantic/Reykjavik"],
  ["Riyadh", "Saudi Arabia", 24.71, 46.68, "Asia/Riyadh"],
  ["Rio de Janeiro", "Brazil", -22.91, -43.17, "America/Sao_Paulo"],
  ["Rome", "Italy", 41.9, 12.5, "Europe/Rome"],
  ["San Francisco", "United States", 37.77, -122.42, "America/Los_Angeles"],
  ["Santiago", "Chile", -33.45, -70.67, "America/Santiago"],
  ["São Paulo", "Brazil", -23.55, -46.63, "America/Sao_Paulo"],
  ["Seattle", "United States", 47.61, -122.33, "America/Los_Angeles"],
  ["Seoul", "South Korea", 37.57, 126.98, "Asia/Seoul"],
  ["Shanghai", "China", 31.23, 121.47, "Asia/Shanghai"],
  ["Singapore", "Singapore", 1.35, 103.82, "Asia/Singapore"],
  ["Stockholm", "Sweden", 59.33, 18.07, "Europe/Stockholm"],
  ["Sydney", "Australia", -33.87, 151.21, "Australia/Sydney"],
  ["Taipei", "Taiwan", 25.03, 121.57, "Asia/Taipei"],
  ["Tehran", "Iran", 35.69, 51.39, "Asia/Tehran"],
  ["Tokyo", "Japan", 35.68, 139.69, "Asia/Tokyo"],
  ["Toronto", "Canada", 43.65, -79.38, "America/Toronto"],
  ["Tunis", "Tunisia", 36.81, 10.18, "Africa/Tunis"],
  ["Vancouver", "Canada", 49.28, -123.12, "America/Vancouver"],
  ["Vienna", "Austria", 48.21, 16.37, "Europe/Vienna"],
  ["Warsaw", "Poland", 52.23, 21.01, "Europe/Warsaw"],
  ["Zurich", "Switzerland", 47.38, 8.54, "Europe/Zurich"],
];

const CC: Record<string, string> = {"Nigeria": "NG", "Ghana": "GH", "Ethiopia": "ET", "Netherlands": "NL", "Greece": "GR", "United States": "US", "New Zealand": "NZ", "Thailand": "TH", "Spain": "ES", "China": "CN", "India": "IN", "Germany": "DE", "Colombia": "CO", "Argentina": "AR", "Egypt": "EG", "South Africa": "ZA", "Morocco": "MA", "Denmark": "DK", "Senegal": "SN", "Tanzania": "TZ", "Bangladesh": "BD", "United Arab Emirates": "AE", "Ireland": "IE", "Finland": "FI", "Vietnam": "VN", "Hong Kong": "HK", "T\u00fcrkiye": "TR", "Indonesia": "ID", "Pakistan": "PK", "Uganda": "UG", "Rwanda": "RW", "DR Congo": "CD", "Malaysia": "MY", "Peru": "PE", "Portugal": "PT", "United Kingdom": "GB", "Philippines": "PH", "Australia": "AU", "Mexico": "MX", "Italy": "IT", "Canada": "CA", "Russia": "RU", "Kenya": "KE", "Japan": "JP", "Norway": "NO", "France": "FR", "Czechia": "CZ", "Iceland": "IS", "Saudi Arabia": "SA", "Brazil": "BR", "Chile": "CL", "South Korea": "KR", "Singapore": "SG", "Sweden": "SE", "Taiwan": "TW", "Iran": "IR", "Tunisia": "TN", "Austria": "AT", "Poland": "PL", "Switzerland": "CH"};

export const CITIES: City[] = RAW.map(([city, country, lat, lng, tz]) => ({ city, country, cc: CC[country] ?? "", lat, lng, tz }));

export function cityForTz(tz: string): City {
  return CITIES.find((c) => c.tz === tz) ?? CITIES.find((c) => c.tz.split("/")[0] === tz.split("/")[0]) ?? CITIES.find((c) => c.city === "London")!;
}

export function searchCities(q: string, limit = 6): City[] {
  const s = q.trim().toLowerCase();
  if (!s) return [];
  return CITIES.filter((c) => c.city.toLowerCase().includes(s) || c.country.toLowerCase().includes(s))
    .sort((a, b) => Number(!a.city.toLowerCase().startsWith(s)) - Number(!b.city.toLowerCase().startsWith(s)))
    .slice(0, limit);
}
