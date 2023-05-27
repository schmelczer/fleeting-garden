export interface GameLoopSettings {
  maxAgentCountUpperLimit: number;
  agentCount: number;
  renderSpeed: number;
  simulatedDelayMs: number;

  aggressionFactor: number;
  nextGenerationSpawnRadius: number;
  nextGenerationSpawnInterval: number;

  startColorHue: number;
}
