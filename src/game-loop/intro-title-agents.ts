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
type IntroPathEasing = 'easeOutQuad' | 'linear';

const INTRO_TITLE = 'Fleeting';
const INTRO_ANGLE_JITTER_RADIANS = Math.PI * 0.08;
const INTRO_ANGLE_EASE_START = 0.6;
const INTRO_ANGLE_EASE_END = 1;
const INTRO_CIRCLE_MIN_SIDE_RATIO = 0.32;
const INTRO_CIRCLE_MAX_SIDE_RATIO = 0.46;
const INTRO_ENTRY_JITTER_SIDE_RATIO = 0.035;
const INTRO_FONT_FAMILY = '"Open Sans", sans-serif';
const INTRO_FONT_SCALE_DOWN = 0.94;
const INTRO_INITIAL_FONT_HEIGHT_RATIO = 0.28;
const INTRO_INITIAL_FONT_WIDTH_RATIO = 0.19;
const INTRO_LETTER_SPACING_EM = 0.07;
const INTRO_MASK_ALPHA_THRESHOLD = 32;
const INTRO_MASK_GRADIENT_THRESHOLD = 8;
const INTRO_MASK_MAX_PIXELS = 1_000_000;
const INTRO_MASK_SAMPLE_DENSITY = 540;
const INTRO_MAX_HEIGHT_RATIO = 0.25;
const INTRO_MAX_WIDTH_RATIO = 0.76;
const INTRO_MIN_ENTRY_JITTER_PX = 6;
const INTRO_MIN_FONT_SIZE_PX = 18;
const INTRO_MIN_TARGET_JITTER_PX = 1;
const INTRO_PATH_EASING: IntroPathEasing = 'easeOutQuad';
const INTRO_PATH_PROGRESS_EPSILON = 0.001;
const INTRO_RADIAL_JITTER_RATIO = 0.35;
const INTRO_RADIAL_START_EPSILON = 0.001;
const INTRO_TARGET_DELAY_DISTANCE_MULTIPLIER = 0.12;
const INTRO_TARGET_DELAY_MAX = 0.22;
const INTRO_TARGET_DELAY_RANDOM_MULTIPLIER = 0.06;
const INTRO_TARGET_JITTER_SIDE_RATIO = 0.0035;
const INTRO_TITLE_COLOR_CUT_LETTERS = [2, 5] as const;
const INTRO_TITLE_RADIUS_MULTIPLIER = 1.55;
const INTRO_TITLE_STROKE_WIDTH_MIN_PX = 6;
const INTRO_TITLE_STROKE_WIDTH_RATIO = 0.11;
const INTRO_VERTICAL_ANCHOR = 0.47;

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
    INTRO_MIN_TARGET_JITTER_PX,
    minSide * INTRO_TARGET_JITTER_SIDE_RATIO
  );
  const entryJitter = Math.max(
    INTRO_MIN_ENTRY_JITTER_PX,
    minSide * INTRO_ENTRY_JITTER_SIDE_RATIO
  );
  const titleRadius = points.reduce(
    (radius, point) =>
      Math.max(
        radius,
        Math.hypot(point.x - safeWidth / 2, point.y - safeHeight * INTRO_VERTICAL_ANCHOR)
      ),
    0
  );
  const introCircleRadius = Math.min(
    Math.max(
      titleRadius * INTRO_TITLE_RADIUS_MULTIPLIER,
      minSide * INTRO_CIRCLE_MIN_SIDE_RATIO
    ),
    minSide * INTRO_CIRCLE_MAX_SIDE_RATIO
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
      INTRO_TARGET_DELAY_MAX,
      distanceFraction * INTRO_TARGET_DELAY_DISTANCE_MULTIPLIER +
        random() * INTRO_TARGET_DELAY_RANDOM_MULTIPLIER
    );
    const pathProgress = getIntroAgentPathProgress(introProgress, introDelay);
    const initialAngle = approachAngle + (random() - 0.5) * INTRO_ANGLE_JITTER_RADIANS;
    const currentAngle = mixAngle(
      initialAngle,
      targetAngle,
      smoothstep(INTRO_ANGLE_EASE_START, INTRO_ANGLE_EASE_END, pathProgress)
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
  const centerY = height * INTRO_VERTICAL_ANCHOR;
  const offsetX = targetX - centerX;
  const offsetY = targetY - centerY;
  const length = Math.hypot(offsetX, offsetY);
  const angle =
    length > INTRO_RADIAL_START_EPSILON
      ? Math.atan2(offsetY, offsetX)
      : random() * Math.PI * 2;
  const directionX = Math.cos(angle);
  const directionY = Math.sin(angle);
  const tangentX = -directionY;
  const tangentY = directionX;
  const tangentJitter = (random() - 0.5) * jitter;
  const radialJitter = (random() - 0.5) * jitter * INTRO_RADIAL_JITTER_RATIO;
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
  const safeMaxPixels = Math.max(1, INTRO_MASK_MAX_PIXELS);
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
  context.font = `${fontSize}px ${INTRO_FONT_FAMILY}`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillStyle = '#fff';
  context.strokeStyle = '#fff';
  context.lineJoin = 'round';
  context.lineWidth = Math.max(
    INTRO_TITLE_STROKE_WIDTH_MIN_PX,
    fontSize * INTRO_TITLE_STROKE_WIDTH_RATIO
  );
  const letterSpacing = fontSize * INTRO_LETTER_SPACING_EM;
  drawIntroTitleText(
    context,
    maskWidth / 2,
    maskHeight * INTRO_VERTICAL_ANCHOR,
    letterSpacing,
    'stroke'
  );
  drawIntroTitleText(
    context,
    maskWidth / 2,
    maskHeight * INTRO_VERTICAL_ANCHOR,
    letterSpacing,
    'fill'
  );

  const { data } = context.getImageData(0, 0, maskWidth, maskHeight);
  const step = Math.max(
    1,
    Math.floor(Math.min(maskWidth, maskHeight) / INTRO_MASK_SAMPLE_DENSITY)
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
      if (alpha < INTRO_MASK_ALPHA_THRESHOLD) {
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
  const cutLetters = INTRO_TITLE_COLOR_CUT_LETTERS.map((cutLetter) =>
    Math.min(letters.length - 1, Math.max(1, Math.round(cutLetter)))
  ).sort((a, b) => a - b);
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
  const maxWidth = width * INTRO_MAX_WIDTH_RATIO;
  const maxHeight = height * INTRO_MAX_HEIGHT_RATIO;
  let fontSize = Math.floor(
    Math.min(
      height * INTRO_INITIAL_FONT_HEIGHT_RATIO,
      width * INTRO_INITIAL_FONT_WIDTH_RATIO
    )
  );

  while (fontSize > INTRO_MIN_FONT_SIZE_PX) {
    context.font = `${fontSize}px ${INTRO_FONT_FAMILY}`;
    const metrics = context.measureText(INTRO_TITLE);
    const measuredHeight =
      metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent || fontSize;

    if (metrics.width <= maxWidth && measuredHeight <= maxHeight) {
      return fontSize;
    }

    fontSize = Math.floor(fontSize * INTRO_FONT_SCALE_DOWN);
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

  if (Math.abs(gradientX) + Math.abs(gradientY) < INTRO_MASK_GRADIENT_THRESHOLD) {
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
    (introProgress - introDelay) / Math.max(INTRO_PATH_PROGRESS_EPSILON, 1 - introDelay);
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
  if (isLinearPathEasing(INTRO_PATH_EASING)) {
    return amount;
  }

  return easeOutQuad(amount);
};
