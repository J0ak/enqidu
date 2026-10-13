/** No public transport meeting ENQIDU's zero-cost + multiuser constraints is documented.
 * Developer Option is paid, personal-only and approval-gated. See docs/fitness-ai-runtime-audit.md.
 * Never read credentials, use ChatGPT tool handles, or perform discovery against private endpoints.
 */
export class FitnessAiServerTransportUnavailable {
  static runtimeAvailable = false;
  async getHealthSummary() {
    throw Object.assign(new Error('connector_runtime_unavailable'), { code: 'connector_runtime_unavailable' });
  }
}
