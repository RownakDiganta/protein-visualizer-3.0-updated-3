// src/components/Visualization/labelPlacement.js

export const AMINO_LABEL_FONT_SIZE = 14;
const AMINO_LABEL_AVG_CHAR_WIDTH_RATIO = 0.62;
export const AMINO_LABEL_HORIZONTAL_PADDING = 6;
export const AMINO_LABEL_LANE_GAP = 28;
export const AMINO_LABEL_BASE_OFFSET = 50;
export const AMINO_LABEL_SAFETY_BUFFER = 20;
export const AMINO_LABEL_MAX_VISIBLE_LANES = 12;

export const estimateLabelWidth = (text, fontSize = AMINO_LABEL_FONT_SIZE) =>
  text.length * fontSize * AMINO_LABEL_AVG_CHAR_WIDTH_RATIO;

export const layoutAminoAcidLabels = ({
  labels,
  side,
  fontSize = AMINO_LABEL_FONT_SIZE,
  horizontalPadding = AMINO_LABEL_HORIZONTAL_PADDING,
  laneGap = AMINO_LABEL_LANE_GAP,
  baseOffset = AMINO_LABEL_BASE_OFFSET
}) => {
  const indexed = labels.map((label, index) => ({ ...label, _index: index }));
  indexed.sort((a, b) => a.x - b.x || a._index - b._index);

  const laneRightEdge = [];

  const placed = indexed.map((label) => {
    const estimatedWidth = estimateLabelWidth(label.text, fontSize);
    const halfWidth = estimatedWidth / 2;
    const left = label.x - halfWidth;
    const right = label.x + halfWidth;

    let lane = 0;
    while (
      laneRightEdge[lane] !== undefined &&
      left <= laneRightEdge[lane] + horizontalPadding
    ) {
      lane += 1;
    }
    laneRightEdge[lane] = right;

    return {
      ...label,
      side,
      lane,
      y: baseOffset + lane * laneGap,
      estimatedWidth
    };
  });

  placed.sort((a, b) => a._index - b._index);
  return placed.map(({ _index, ...rest }) => rest);
};

export const computeRequiredLabelSpace = (
  layout,
  {
    laneGap = AMINO_LABEL_LANE_GAP,
    baseOffset = AMINO_LABEL_BASE_OFFSET,
    buffer = AMINO_LABEL_SAFETY_BUFFER
  } = {}
) => {
  const maxLane = layout.reduce((max, label) => Math.max(max, label.lane), -1);
  if (maxLane < 0) {
    return 0;
  }
  return baseOffset + (maxLane + 1) * laneGap + buffer;
};

export const AMINO_ACID_BASE_CONNECTOR_LENGTH = AMINO_LABEL_BASE_OFFSET;
export const AMINO_ACID_LANE_GAP = 26;
export const MAX_AMINO_ACID_LANES = 4;

export const buildTypeBandMap = (orderedTypeKeys) => {
  const bandByType = new Map();
  orderedTypeKeys.forEach((key) => {
    if (!bandByType.has(key)) {
      bandByType.set(key, bandByType.size);
    }
  });
  return bandByType;
};

export const layoutAminoAcidLabelsByType = ({
  labels,
  side,
  bandMap,
  baseConnectorLength = AMINO_ACID_BASE_CONNECTOR_LENGTH,
  laneGap = AMINO_ACID_LANE_GAP
}) => {
  const resolvedBandMap =
    bandMap || buildTypeBandMap(labels.map((label) => label.aminoAcid));

  return labels.map((label) => {
    const lane = resolvedBandMap.get(label.aminoAcid) || 0;
    return {
      ...label,
      side,
      lane,
      y: baseConnectorLength + lane * laneGap
    };
  });
};
