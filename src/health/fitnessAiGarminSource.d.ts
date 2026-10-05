import { GarminSource, GarminSourcePage, GarminSourceRequest, JsonValue } from "./garminSource.js";

export interface FitnessAiGarminTransport {
  getHealthSummary(request: Required<GarminSourceRequest>): Promise<Record<string, unknown>>;
}
export interface FitnessAiGarminSourceOptions {
  transport: FitnessAiGarminTransport;
  clock?: () => Date;
}
export class FitnessAiGarminSource extends GarminSource {
  constructor(options: FitnessAiGarminSourceOptions);
  getHealthRecords(request: GarminSourceRequest): Promise<GarminSourcePage & { source_metadata: JsonValue }>;
}
