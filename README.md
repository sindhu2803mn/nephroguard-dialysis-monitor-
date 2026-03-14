/**
 * Blynk IoT REST API Service
 * Documentation: https://docs.blynk.io/en/blynk.cloud/get-datapoint-value
 */

const AUTH_TOKEN = process.env.VITE_BLYNK_AUTH_TOKEN;
const SERVER_URL = process.env.VITE_BLYNK_SERVER_URL || 'blynk.cloud';

export interface BlynkData {
  heartRate: number;
  spo2: number;
  temp: number;
  flow: number;
  bp: string;
  status: string;
}

/**
 * Fetches a single pin value from Blynk
 */
export async function getPinValue(pin: string): Promise<string> {
  if (!AUTH_TOKEN) return '0';
  try {
    const response = await fetch(`https://${SERVER_URL}/external/api/get?token=${AUTH_TOKEN}&${pin}`);
    if (!response.ok) throw new Error('Blynk API Error');
    return await response.text();
  } catch (error) {
    console.error(`Error fetching pin ${pin}:`, error);
    return '0';
  }
}

/**
 * Fetches multiple pins at once (Blynk Batch Fetch)
 * Note: Blynk API usually requires individual calls or specific batch endpoints depending on plan.
 * We'll simulate a batch fetch for the dashboard.
 */
export async function getAllVitals(): Promise<Partial<BlynkData>> {
  if (!AUTH_TOKEN) return {};

  // Example Pin Mapping:
  // V1: Heart Rate
  // V2: SpO2
  // V3: Temperature
  // V4: Flow Rate
  // V5: Blood Pressure (String)
  
  const pins = ['V1', 'V2', 'V3', 'V4', 'V5'];
  const results = await Promise.all(pins.map(pin => getPinValue(pin)));

  return {
    heartRate: parseFloat(results[0]) || 0,
    spo2: parseFloat(results[1]) || 0,
    temp: parseFloat(results[2]) || 0,
    flow: parseFloat(results[3]) || 0,
    bp: results[4] || '0/0',
  };
}

/**
 * Updates a pin value on Blynk (e.g., to trigger a buzzer or LED)
 */
export async function updatePinValue(pin: string, value: string | number): Promise<boolean> {
  if (!AUTH_TOKEN) return false;
  try {
    const response = await fetch(`https://${SERVER_URL}/external/api/update?token=${AUTH_TOKEN}&${pin}=${value}`);
    return response.ok;
  } catch (error) {
    console.error(`Error updating pin ${pin}:`, error);
    return false;
  }
}
