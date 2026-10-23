/**
 * Delivery presets (Catalog Q2, FR-VOI-07): reusable delivery settings. At generation they resolve against the voice's
 * range bank (emotion → reference) and the engine's reported controls; unsupported settings are not sent (FR-VOI-08).
 */
export interface DeliveryPreset { emotion: string; pace?: number; instruction?: string; gainDb?: number }

export const DELIVERIES: Record<string, DeliveryPreset> = {
  neutral: { emotion: 'neutral', pace: 1 },
  warm: { emotion: 'happy', pace: 0.95 },
  upbeat: { emotion: 'happy', pace: 1.08 },
  nervous: { emotion: 'nervous', pace: 1.1, instruction: 'hesitant, with small pauses' },
  angry: { emotion: 'angry', pace: 1.05 },
  sad: { emotion: 'sad', pace: 0.9 },
  whisper: { emotion: 'whisper', gainDb: -6 },
  sarcastic: { emotion: 'neutral', instruction: 'dry, sarcastic' },
  excited: { emotion: 'happy', pace: 1.15 },
  deadpan: { emotion: 'deadpan', instruction: 'flat, deadpan' },
  shouting: { emotion: 'angry', instruction: 'shouting, high energy' },
  teasing: { emotion: 'happy', instruction: 'playful teasing' },
};
