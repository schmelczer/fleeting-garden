export const exponentialDecay = ({
  accumulator,
  nextValue,
  biasOfNextValue,
}: {
  accumulator: number;
  nextValue: number;
  biasOfNextValue: number;
}) => accumulator * (1 - biasOfNextValue) + nextValue * biasOfNextValue;
