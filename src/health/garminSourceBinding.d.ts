import type { GarminSource } from './garminSource.js';
/** Server-only capability. Never serialize source or internal binding revision to an HTTP response. */
export interface GarminSourceBinding {
  user_id: string;
  provider: 'garmin';
  provider_mode: 'aggregator';
  ingestion_channel: 'fitness_ai_connector';
  connection_status: 'connected';
  consent_status: 'active';
  consent_version: 'garmin_daily_v1';
  connected_at: string;
  revoked_at: null;
  binding_verified_at: string;
  binding_revision: number;
  source: GarminSource;
}
export type SourceForUser = (serverResolvedUserId: string) => Promise<GarminSourceBinding>;
