export interface GameLoopSettings {
  agentCount: number;
  renderSpeed: number;
  simulatedDelayMs: number;

  aggressionFactor: number;
  nextGenerationSpawnRadius: number;
  nextGenerationSpawnInterval: number;
}
