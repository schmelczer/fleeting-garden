import { appConfig, type GardenAppConfig } from '../config';
import { AGENT_FLOAT_COUNT, writeAgentValues } from '../pipelines/agents/agent-limits';
import { clamp, easeOutQuad, mix, mixAngle, smoothstep } from '../utils/math';

interface IntroTitlePoint {
  x: number;
  y: number;
  tangent: number | null;
  colorIndex: number;
}

interface IntroTitleAgentOptions {
  count: number;
  width: number;
  height: number;
  progress?: number;
  seed?: number;
}

type RandomSource = () => number;
type IntroPathEasing = GardenAppConfig['simulation']['intro']['pathEasing'];

const INTRO_TITLE = appConfig.simulation.intro.title;
const isLinearPathEasing = (pathEasing: IntroPathEasing): boolean =>
  pathEasing === 'linear';

export const createIntroTitleAgents = ({
  count,
  width,
  height,
  progress = 0,
  seed,
}: IntroTitleAgentOptions): Float32Array => {
  if (count <= 0) {
    return new Float32Array();
  }

  const random = seed === undefined ? Math.random : createSeededRandom(seed);
  const introProgress = clamp(progress, 0, 1);
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);
  const points = createIntroTitlePoints(safeWidth, safeHeight);
  if (points.length === 0) {
    return new Float32Array();
  }

  const data = new Float32Array(count * AGENT_FLOAT_COUNT);
  const minSide = Math.min(safeWidth, safeHeight);
  const targetJitter = Math.max(
    appConfig.simulation.intro.minTargetJitterPx,
    minSide * appConfig.simulation.intro.targetJitterSideRatio
  );
  const entryJitter = Math.max(
    appConfig.simulation.intro.minEntryJitterPx,
    minSide * appConfig.simulation.intro.entryJitterSideRatio
  );
  const titleRadius = points.reduce(
    (radius, point) =>
      Math.max(
        radius,
        Math.hypot(
          point.x - safeWidth / 2,
          point.y - safeHeight * appConfig.simulation.intro.verticalAnchor
        )
      ),
    0
  );
  const introCircleRadius = Math.min(
    Math.max(
      titleRadius * appConfig.simulation.intro.titleRadiusMultiplier,
      minSide * appConfig.simulation.intro.circleMinSideRatio
    ),
    minSide * appConfig.simulation.intro.circleMaxSideRatio
  );

  for (let i = 0; i < count; i++) {
    const point = points[Math.floor(random() * points.length)];
    const targetX = Math.max(
      0,
      Math.min(safeWidth - 1, point.x + (random() - 0.5) * targetJitter)
    );
    const targetY = Math.max(
      0,
      Math.min(safeHeight - 1, point.y + (random() - 0.5) * targetJitter)
    );
    const [startX, startY] = getIntroRadialStart(
      targetX,
      targetY,
      safeWidth,
      safeHeight,
      introCircleRadius,
      entryJitter,
      random
    );
    const approachAngle = Math.atan2(targetY - startY, targetX - startX);
    let targetAngle = point.tangent ?? approachAngle;
    if (Math.cos(targetAngle - approachAngle) < 0) {
      targetAngle += Math.PI;
    }

    const distanceFraction =
      Math.hypot(targetX - startX, targetY - startY) / Math.hypot(safeWidth, safeHeight);
    const introDelay = Math.min(
      appConfig.simulation.intro.targetDelayMax,
      distanceFraction * appConfig.simulation.intro.targetDelayDistanceMultiplier +
        random() * appConfig.simulation.intro.targetDelayRandomMultiplier
    );
    const pathProgress = getIntroAgentPathProgress(introProgress, introDelay);
    const initialAngle =
      approachAngle + (random() - 0.5) * appConfig.simulation.intro.angleJitterRadians;
    const currentAngle = mixAngle(
      initialAngle,
      targetAngle,
      smoothstep(
        appConfig.simulation.intro.angleEaseStart,
        appConfig.simulation.intro.angleEaseEnd,
        pathProgress
      )
    );
    writeAgentValues(data, i, {
      positionX: mix(startX, targetX, pathProgress),
      positionY: mix(startY, targetY, pathProgress),
      angle: currentAngle,
      colorIndex: point.colorIndex,
      targetPositionX: targetX,
      targetPositionY: targetY,
      targetAngle,
      introDelay,
    });
  }

  return data;
};

const getIntroRadialStart = (
  targetX: number,
  targetY: number,
  width: number,
  height: number,
  radius: number,
  jitter: number,
  random: RandomSource
): [number, number] => {
  const centerX = width / 2;
  const centerY = height * appConfig.simulation.intro.verticalAnchor;
  const offsetX = targetX - centerX;
  const offsetY = targetY - centerY;
  const length = Math.hypot(offsetX, offsetY);
  const angle =
    length > appConfig.simulation.intro.radialStartEpsilon
      ? Math.atan2(offsetY, offsetX)
      : random() * Math.PI * 2;
  const directionX = Math.cos(angle);
  const directionY = Math.sin(angle);
  const tangentX = -directionY;
  const tangentY = directionX;
  const tangentJitter = (random() - 0.5) * jitter;
  const radialJitter =
    (random() - 0.5) * jitter * appConfig.simulation.intro.radialJitterRatio;
  const startX =
    centerX + directionX * (radius + radialJitter) + tangentX * tangentJitter;
  const startY =
    centerY + directionY * (radius + radialJitter) + tangentY * tangentJitter;

  return [
    Math.max(0, Math.min(width - 1, startX)),
    Math.max(0, Math.min(height - 1, startY)),
  ];
};

const createIntroTitlePoints = (
  width: number,
  height: number
): Array<IntroTitlePoint> => {
  const safeMaxPixels = Math.max(1, appConfig.simulation.intro.maskMaxPixels);
  const maskScale = Math.min(1, Math.sqrt(safeMaxPixels / Math.max(1, width * height)));
  const maskWidth = Math.max(1, Math.round(width * maskScale));
  const maskHeight = Math.max(1, Math.round(height * maskScale));
  const pointScaleX = width / maskWidth;
  const pointScaleY = height / maskHeight;
  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = maskWidth;
  maskCanvas.height = maskHeight;
  const context = maskCanvas.getContext('2d', { willReadFrequently: true });
  if (!context) {
    return [];
  }

  const fontSize = getIntroTitleFontSize(context, maskWidth, maskHeight);
  context.clearRect(0, 0, maskWidth, maskHeight);
  context.font = `${fontSize}px ${appConfig.simulation.intro.fontFamily}`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillStyle = '#fff';
  context.strokeStyle = '#fff';
  context.lineJoin = 'round';
  context.lineWidth = Math.max(
    appConfig.simulation.intro.titleStrokeWidthMinPx,
    fontSize * appConfig.simulation.intro.titleStrokeWidthRatio
  );
  const letterSpacing = fontSize * appConfig.simulation.intro.letterSpacingEm;
  drawIntroTitleText(
    context,
    maskWidth / 2,
    maskHeight * appConfig.simulation.intro.verticalAnchor,
    letterSpacing,
    'stroke'
  );
  drawIntroTitleText(
    context,
    maskWidth / 2,
    maskHeight * appConfig.simulation.intro.verticalAnchor,
    letterSpacing,
    'fill'
  );

  const { data } = context.getImageData(0, 0, maskWidth, maskHeight);
  const step = Math.max(
    1,
    Math.floor(
      Math.min(maskWidth, maskHeight) / appConfig.simulation.intro.maskSampleDensity
    )
  );
  const points: Array<IntroTitlePoint> = [];
  const characterColorBoundaries = getIntroTitleColorBoundaries(
    context,
    maskWidth,
    letterSpacing
  );

  for (let y = 0; y < maskHeight; y += step) {
    for (let x = 0; x < maskWidth; x += step) {
      const alpha = getMaskAlpha(data, maskWidth, maskHeight, x, y);
      if (alpha < appConfig.simulation.intro.maskAlphaThreshold) {
        continue;
      }

      points.push({
        x: x * pointScaleX,
        y: y * pointScaleY,
        tangent: estimateMaskTangent(data, maskWidth, maskHeight, x, y),
        colorIndex: getIntroTitleColorIndex(x, characterColorBoundaries),
      });
    }
  }

  return points;
};

const getIntroTitleColorBoundaries = (
  context: CanvasRenderingContext2D,
  width: number,
  letterSpacing: number
): [number, number] => {
  const letters = Array.from(INTRO_TITLE);
  const totalWidth = measureIntroTitleText(context, letters, letterSpacing);
  let x = width / 2 - totalWidth / 2;
  const cutLetters = appConfig.simulation.intro.titleColorCutLetters
    .map((cutLetter) => Math.min(letters.length - 1, Math.max(1, Math.round(cutLetter))))
    .sort((a, b) => a - b);
  const [firstCutLetter, secondCutLetter] = cutLetters;
  const letterBoxes = letters.map((letter, index) => {
    const letterWidth = context.measureText(letter).width;
    const box = {
      left: x,
      right: x + letterWidth,
    };
    x += letterWidth + (index === letters.length - 1 ? 0 : letterSpacing);
    return box;
  });

  const getBoundaryBetweenLetters = (leftLetterIndex: number) =>
    (letterBoxes[leftLetterIndex].right + letterBoxes[leftLetterIndex + 1].left) / 2;

  return [
    getBoundaryBetweenLetters(firstCutLetter - 1),
    getBoundaryBetweenLetters(secondCutLetter - 1),
  ];
};

const drawIntroTitleText = (
  context: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  letterSpacing: number,
  mode: 'fill' | 'stroke'
): void => {
  const letters = Array.from(INTRO_TITLE);
  const totalWidth = measureIntroTitleText(context, letters, letterSpacing);
  let x = centerX - totalWidth / 2;

  letters.forEach((letter, index) => {
    const letterWidth = context.measureText(letter).width;
    const drawX = x + letterWidth / 2;
    if (mode === 'fill') {
      context.fillText(letter, drawX, centerY);
    } else {
      context.strokeText(letter, drawX, centerY);
    }
    x += letterWidth + (index === letters.length - 1 ? 0 : letterSpacing);
  });
};

const measureIntroTitleText = (
  context: CanvasRenderingContext2D,
  letters: Array<string>,
  letterSpacing: number
): number => {
  const textWidth = letters.reduce(
    (width, letter) => width + context.measureText(letter).width,
    0
  );
  return textWidth + Math.max(0, letters.length - 1) * letterSpacing;
};

const getIntroTitleColorIndex = (x: number, boundaries: [number, number]): number => {
  if (x < boundaries[0]) {
    return 0;
  }

  if (x < boundaries[1]) {
    return 1;
  }

  return 2;
};

const getIntroTitleFontSize = (
  context: CanvasRenderingContext2D,
  width: number,
  height: number
): number => {
  const maxWidth = width * appConfig.simulation.intro.maxWidthRatio;
  const maxHeight = height * appConfig.simulation.intro.maxHeightRatio;
  let fontSize = Math.floor(
    Math.min(
      height * appConfig.simulation.intro.initialFontHeightRatio,
      width * appConfig.simulation.intro.initialFontWidthRatio
    )
  );

  while (fontSize > appConfig.simulation.intro.minFontSizePx) {
    context.font = `${fontSize}px ${appConfig.simulation.intro.fontFamily}`;
    const metrics = context.measureText(INTRO_TITLE);
    const measuredHeight =
      metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent || fontSize;

    if (metrics.width <= maxWidth && measuredHeight <= maxHeight) {
      return fontSize;
    }

    fontSize = Math.floor(fontSize * appConfig.simulation.intro.fontScaleDown);
  }

  return fontSize;
};

const estimateMaskTangent = (
  data: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number
): number | null => {
  const gradientX =
    getMaskAlpha(data, width, height, x + 1, y) -
    getMaskAlpha(data, width, height, x - 1, y);
  const gradientY =
    getMaskAlpha(data, width, height, x, y + 1) -
    getMaskAlpha(data, width, height, x, y - 1);

  if (
    Math.abs(gradientX) + Math.abs(gradientY) <
    appConfig.simulation.intro.maskGradientThreshold
  ) {
    return null;
  }

  return Math.atan2(gradientX, -gradientY);
};

const getMaskAlpha = (
  data: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number
): number => {
  const clampedX = Math.max(0, Math.min(width - 1, Math.round(x)));
  const clampedY = Math.max(0, Math.min(height - 1, Math.round(y)));
  return data[(clampedY * width + clampedX) * 4 + 3];
};

const getIntroAgentPathProgress = (introProgress: number, introDelay: number): number => {
  if (introProgress <= introDelay) {
    return 0;
  }

  const activeProgress =
    (introProgress - introDelay) /
    Math.max(appConfig.simulation.intro.pathProgressEpsilon, 1 - introDelay);
  return easePathProgress(clamp(activeProgress, 0, 1));
};

const createSeededRandom = (seed: number): RandomSource => {
  let state = seed >>> 0;

  return () => {
    let value = (state += 0x6d2b79f5);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
};

const easePathProgress = (amount: number): number => {
  if (isLinearPathEasing(appConfig.simulation.intro.pathEasing)) {
    return amount;
  }

  return easeOutQuad(amount);
};
