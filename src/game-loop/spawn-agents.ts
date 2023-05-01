import { Agent } from '../pipelines/agents/agent';
import { settings } from '../settings';
import { Random } from '../utils/random';

import { vec2 } from 'gl-matrix';

export const spawnAgents = (canvasSize: vec2, agentCount: number): Array<Agent> => {
  const minSize = Math.min(...canvasSize);
  const center = vec2.scale(vec2.create(), canvasSize, 0.5);

  return new Array(agentCount).fill(0).map(() => {
    const radius = Random.randomBetween(0, minSize * settings.startingRadius);
    const angle = Random.randomBetween(0, Math.PI * 2);

    const delta = vec2.fromValues(Math.cos(angle) * radius, Math.sin(angle) * radius);

    const position = vec2.add(vec2.create(), center, delta);

    return {
      position,
      direction: vec2.fromValues(Math.cos(angle + Math.PI), Math.sin(angle + Math.PI)),
      species: 0,
      timeToLive: Random.randomBetween(10, 15000),
    };
  });
};
