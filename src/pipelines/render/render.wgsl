struct Settings {
  colorA: vec3<f32>,
  _colorAPadding: f32,
  colorB: vec3<f32>,
  _colorBPadding: f32,
  colorC: vec3<f32>,
  _colorCPadding: f32,
  backgroundColor: vec3<f32>,
  clarity: f32,
  traceNormalizationFloor: f32,
  brushColorBase: f32,
  brushColorStrengthMultiplier: f32,
};

const COMMON_CHANNEL_REDUCTION: f32 = 0.75;
const OVERLAP_SATURATION_BOOST: f32 = 1.35;
const LOW_SATURATION_RESCUE_AMOUNT: f32 = 0.65;
const LOW_SATURATION_RESCUE_MIN: f32 = 0.08;
const LOW_SATURATION_RESCUE_MAX: f32 = 0.22;
const COLOR_WEIGHT_EPSILON: f32 = 0.0001;
const LUMA_WEIGHTS: vec3<f32> = vec3<f32>(0.2126, 0.7152, 0.0722);

@group(0) @binding(0) var<uniform> settings: Settings;
@group(0) @binding(2) var trailMap: texture_2d<f32>;
@group(0) @binding(3) var sourceMap: texture_2d<f32>;

@fragment
fn fragment(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
  let pixel = vec2<i32>(position.xy);
  let traces = textureLoad(trailMap, pixel, 0);
  let sources = textureLoad(sourceMap, pixel, 0);
  return renderColor(traces, sources, getFlatBackground());
}

@fragment
fn fragmentNoSource(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
  let pixel = vec2<i32>(position.xy);
  let traces = textureLoad(trailMap, pixel, 0);
  return renderColor(traces, vec4<f32>(0.0), getFlatBackground());
}

fn renderColor(traces: vec4<f32>, sources: vec4<f32>, background: vec3<f32>) -> vec4<f32> {
  let traceStrengths = clarity(traces.rgb);
  let sourceStrengths = clarity(sources.rgb);
  let traceStrength = maxComponent(traceStrengths);
  let brushStrength = maxComponent(sourceStrengths);
  if max(traceStrength, brushStrength) <= 0.0 {
    return vec4(background, 1);
  }

  if brushStrength <= 0.0 {
    let traceColor = colorFromChannelStrengths(traceStrengths);
    return vec4(mix(background, clamp(traceColor, vec3(0), vec3(1)), traceStrength), 1);
  }

  let strengths = max(traceStrengths, sourceStrengths);
  let traceColor = colorFromChannelStrengths(strengths);
  let brushColor = colorFromChannelStrengths(sourceStrengths);
  let brushVisibility = clamp(
    brushStrength * (
      settings.brushColorBase +
      brushStrength * settings.brushColorStrengthMultiplier
    ),
    0,
    1
  );
  let color = mix(traceColor, brushColor, brushVisibility);

  let strength = max(maxComponent(strengths), brushVisibility);
  return vec4(mix(background, clamp(color, vec3(0), vec3(1)), strength), 1);
}

fn maxComponent(v: vec3<f32>) -> f32 {
  return max(max(v.r, v.g), v.b);
}

fn minComponent(v: vec3<f32>) -> f32 {
  return min(min(v.r, v.g), v.b);
}

fn componentSum(v: vec3<f32>) -> f32 {
  return v.r + v.g + v.b;
}

fn clarity(strength: vec3<f32>) -> vec3<f32> {
  return pow(clamp(strength, vec3(0), vec3(1)), vec3(settings.clarity));
}

fn colorFromChannelStrengths(strengths: vec3<f32>) -> vec3<f32> {
  if maxComponent(strengths) <= 0.0 {
    return vec3<f32>(0.0);
  }

  let weights = colorWeights(strengths);
  let color =
      weights.r * settings.colorA
    + weights.g * settings.colorB
    + weights.b * settings.colorC;
  return preserveOverlapVibrancy(normalizeColorIntensity(color), strengths);
}

fn colorWeights(strengths: vec3<f32>) -> vec3<f32> {
  let commonStrength = minComponent(strengths);
  var weightBase = max(
    strengths - vec3<f32>(commonStrength * COMMON_CHANNEL_REDUCTION),
    vec3<f32>(0.0)
  );
  if componentSum(weightBase) <= COLOR_WEIGHT_EPSILON {
    weightBase = strengths;
  }

  let sharpenedWeights = weightBase * weightBase;
  return sharpenedWeights / max(COLOR_WEIGHT_EPSILON, componentSum(sharpenedWeights));
}

fn preserveOverlapVibrancy(color: vec3<f32>, strengths: vec3<f32>) -> vec3<f32> {
  let strongest = maxComponent(strengths);
  let overlapAmount = clamp(
    (componentSum(strengths) - strongest) / max(COLOR_WEIGHT_EPSILON, strongest),
    0.0,
    1.0
  );

  let luminance = dot(color, LUMA_WEIGHTS);
  var vibrantColor = clamp(
    vec3<f32>(luminance) +
      (color - vec3<f32>(luminance)) *
      mix(1.0, OVERLAP_SATURATION_BOOST, overlapAmount),
    vec3<f32>(0.0),
    vec3<f32>(1.0)
  );

  let saturation = maxComponent(vibrantColor) - minComponent(vibrantColor);
  let rescueAmount =
    overlapAmount *
    (1.0 - smoothstep(LOW_SATURATION_RESCUE_MIN, LOW_SATURATION_RESCUE_MAX, saturation)) *
    LOW_SATURATION_RESCUE_AMOUNT;
  return mix(vibrantColor, dominantColor(strengths), rescueAmount);
}

fn dominantColor(strengths: vec3<f32>) -> vec3<f32> {
  if strengths.r >= strengths.g && strengths.r >= strengths.b {
    return normalizeColorIntensity(settings.colorA);
  }
  if strengths.g >= strengths.b {
    return normalizeColorIntensity(settings.colorB);
  }
  return normalizeColorIntensity(settings.colorC);
}

fn normalizeColorIntensity(color: vec3<f32>) -> vec3<f32> {
  let brightestChannel = maxComponent(color);
  return color / max(settings.traceNormalizationFloor, brightestChannel);
}

fn getFlatBackground() -> vec3<f32> {
  return clamp(settings.backgroundColor, vec3(0), vec3(1));
}
