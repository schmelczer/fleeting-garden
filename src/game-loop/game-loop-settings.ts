export interface GameLoopSettings {
  agentCount: number;
  initialDeadRatio: number;
  renderSpeed: number;
  simulatedDelayMs: number;

  aggressionFactor: number;
  nextGenerationSpawnRadius: number;
}
