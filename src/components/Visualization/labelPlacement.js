// src/components/Visualization/labelPlacement.js
// #RD START
// This module provides TWO label-layout strategies, used by different views in
// Visualization/index.js:
//
// - layoutAminoAcidLabels(): collision-aware lane packing, used by the zoomed
//   window view. Every label's rendered text width is estimated, treated as a
//   horizontal interval around its x position, and packed into the first lane
//   whose last-placed interval doesn't overlap it (a classic greedy
//   interval/lane-packing algorithm, the same kind used for stacking overlapping
//   calendar events). Labels are never dropped - a cluster too dense for existing
//   lanes always gets a new lane instead of being hidden, filtered, or truncated.
//
// - layoutAminoAcidLabelsByType(): used by the full-length view. This project's
//   visualization philosophy groups by amino-acid TYPE: every occurrence of the
//   same selected amino acid (e.g. every W) shares exactly one fixed connector
//   length and label height, while different selected amino acids (e.g. W vs L)
//   occupy different fixed heights - see AMINO_ACID_BASE_CONNECTOR_LENGTH/
//   AMINO_ACID_LANE_GAP below. The full-length view is an overview, not a
//   detailed layout: labels are never staggered per-residue and never affected
//   by collisions or density - a type's whole cluster (however dense) renders on
//   its one level, with some text overlap accepted as the tradeoff for staying
//   compact. Exact, non-overlapping positions are the zoomed window's job.

// Nominal font size (px) used only for estimating label width - the actual letter
// and position-number text use two real CSS font sizes (see index.scss), but a
// single representative size is enough for the width heuristic below.
export const AMINO_LABEL_FONT_SIZE = 14;
// Average glyph width as a fraction of font size for the bold sans-serif label
// text; used to estimate a label's rendered width from its character count
// without needing a canvas/DOM text-measurement (which isn't reliably available
// in the jsdom test environment) - see estimateLabelWidth().
const AMINO_LABEL_AVG_CHAR_WIDTH_RATIO = 0.62;
// Minimum horizontal gap required between two labels' estimated intervals before
// they're considered non-overlapping and allowed to share a lane.
export const AMINO_LABEL_HORIZONTAL_PADDING = 6;
// Vertical distance between adjacent lanes - noticeably larger than the old
// per-level growth, and constant (linear) rather than growing per lane, per the
// requested "font size + 8 to 14px" guidance (14 + 14 = 28).
export const AMINO_LABEL_LANE_GAP = 28;
// Distance from the spine to lane 0, matching where labels sat before this change
// (bond end was previously SULFIDE_POS +/- 50) so the common, uncrowded case looks
// the same as before.
export const AMINO_LABEL_BASE_OFFSET = 50;
// Extra breathing room reserved beyond the last lane when sizing the SVG, so the
// outermost label's own text/halo isn't flush against the edge.
export const AMINO_LABEL_SAFETY_BUFFER = 20;
// Soft, non-enforced reference point: lane counts at or under this are the
// "typical" case. Real lane counts are never capped or truncated at this value -
// it only triggers a console warning so unusually dense proteins are noticeable
// during development; the SVG is still expanded to fit however many lanes are
// actually required.
export const AMINO_LABEL_MAX_VISIBLE_LANES = 12;

/**
 * Estimate a label's rendered pixel width from its character count. Deterministic
 * and environment-independent (no canvas/DOM dependency), which also makes it
 * reliably unit-testable; CanvasRenderingContext2D.measureText would be more
 * precise but isn't reliably available under jsdom without an extra canvas-mock
 * dependency this project doesn't otherwise need.
 *
 * @param {string} text - the full label text, e.g. "W137", "K2750".
 * @param {number} fontSize
 * @returns {number}
 */
export const estimateLabelWidth = (text, fontSize = AMINO_LABEL_FONT_SIZE) =>
  text.length * fontSize * AMINO_LABEL_AVG_CHAR_WIDTH_RATIO;

/**
 * Collision-aware lane packing for a set of labels on ONE side (above or below
 * the spine). Every input label is always returned (never dropped): labels are
 * sorted by x (tie-broken by their original array index, for determinism), then
 * greedily assigned to the first lane whose rightmost occupied edge is far enough
 * to the left of the new label's left edge; a new lane is created only when no
 * existing lane has room.
 *
 * @param {Object} params
 * @param {Array<{x: number, text: string}>} params.labels - arbitrary extra
 *   fields (color, aminoAcid, position, ...) are preserved on the output.
 * @param {'above'|'below'} [params.side] - not used by the packing math itself
 *   (each call already only receives one side's labels), passed through onto the
 *   output for the caller's convenience.
 * @param {number} [params.fontSize]
 * @param {number} [params.horizontalPadding]
 * @param {number} [params.laneGap]
 * @param {number} [params.baseOffset]
 * @returns {Array} each input label plus { lane, y, estimatedWidth }, in the same
 *   order the labels were supplied in.
 */
export const layoutAminoAcidLabels = ({
  labels,
  side,
  fontSize = AMINO_LABEL_FONT_SIZE,
  horizontalPadding = AMINO_LABEL_HORIZONTAL_PADDING,
  laneGap = AMINO_LABEL_LANE_GAP,
  baseOffset = AMINO_LABEL_BASE_OFFSET
}) => {
  const indexed = labels.map((label, index) => ({ ...label, _index: index }));
  // Sort by rendered x-coordinate; ties broken by original index (stable and
  // deterministic regardless of which amino acid contributed which label), so the
  // same protein + selection always produces the same layout.
  indexed.sort((a, b) => a.x - b.x || a._index - b._index);

  // laneRightEdge[lane] = right edge (x + halfWidth) of the last label placed in
  // that lane.
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

  // Restore original input order (packing needed x-sorted order, but callers
  // zipping this back with other per-label state expect the input order back)
  // and drop the internal sort key.
  placed.sort((a, b) => a._index - b._index);
  return placed.map(({ _index, ...rest }) => rest);
};

/**
 * How much vertical pixel space (from the spine outward) a side's layout needs so
 * its farthest lane isn't clipped - used to grow the SVG/container dynamically
 * instead of assuming a fixed small number of lanes.
 *
 * @param {Array<{lane: number}>} layout - output of layoutAminoAcidLabels().
 * @param {Object} [config]
 * @returns {number} required pixels from the spine outward; 0 if layout is empty.
 */
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
// #RD END

// #RD START
// Shared geometry for the full-length view's per-amino-acid-type layout. Per
// Professor Sun's clarified design, the full-length view is an OVERVIEW, not a
// detailed layout: the zoomed window below is where exact, collision-free
// positions belong. So here there is exactly ONE level of spacing -
// AMINO_ACID_LANE_GAP - the small, tight gap between different selected
// amino-acid TYPES' vertical bands (e.g. the W band vs the L band). There is no
// second, sub-lane level: every occurrence of one type shares the exact same y,
// regardless of how densely its residues cluster in x - see
// layoutAminoAcidLabelsByType below.
export const AMINO_ACID_BASE_CONNECTOR_LENGTH = AMINO_LABEL_BASE_OFFSET;
// Tight, fixed vertical distance between adjacent amino-acid-type lanes, so
// several selected types stack into compact, clean bands instead of consuming
// large amounts of screen height.
export const AMINO_ACID_LANE_GAP = 26;
// Mirrors constants.js' MAX_SELECTED_AMINO_ACIDS (kept as its own constant here
// rather than importing that module, so this file stays a pure, dependency-free
// helper) - at most this many distinct amino-acid TYPE lanes can ever exist on
// one side of the full-length view, since a user can never select more types
// than that.
export const MAX_AMINO_ACID_LANES = 4;

/**
 * Per-amino-acid-type layout for the full-length protein view: one fixed,
 * compact vertical level per selected amino-acid TYPE. Every occurrence of the
 * same type (e.g. every W, however densely they cluster in x) is given the
 * exact same y-coordinate and therefore the exact same connector-line length;
 * different types get different, tightly-spaced levels
 * (AMINO_ACID_LANE_GAP apart). There is no per-residue sub-lane and no
 * collision/density-driven staggering - dense same-type clusters are expected
 * to overlap somewhat in this overview; the zoomed window below
 * (layoutAminoAcidLabels) is responsible for exact, readable positions.
 *
 * Lane 0 goes to whichever amino-acid type is first encountered in `labels`.
 * Because the caller (buildAminoAcidLabelLayout in Visualization/index.js)
 * builds `labels` by iterating the selected-amino-acids selection state in
 * order and pushing all of one type's occurrences together, "first
 * encountered" here is exactly "first selected", making lane assignment
 * stable, deterministic and predictable (1st selected type -> lane 0, 2nd ->
 * lane 1, ...).
 *
 * @param {Object} params
 * @param {Array<{x: number, text: string, aminoAcid: string}>} params.labels -
 *   arbitrary extra fields (color, position, textDistance, ...) are preserved.
 * @param {'above'|'below'} [params.side] - passed through onto the output.
 * @param {number} [params.baseConnectorLength]
 * @param {number} [params.laneGap]
 * @returns {Array} each input label plus { lane, y }, in the same order the
 *   labels were supplied in.
 */
export const layoutAminoAcidLabelsByType = ({
  labels,
  side,
  baseConnectorLength = AMINO_ACID_BASE_CONNECTOR_LENGTH,
  laneGap = AMINO_ACID_LANE_GAP
}) => {
  const laneByAminoAcid = new Map();
  labels.forEach((label) => {
    if (!laneByAminoAcid.has(label.aminoAcid)) {
      laneByAminoAcid.set(label.aminoAcid, laneByAminoAcid.size);
    }
  });

  return labels.map((label) => {
    const lane = laneByAminoAcid.get(label.aminoAcid);
    return {
      ...label,
      side,
      lane,
      y: baseConnectorLength + lane * laneGap
    };
  });
};
// #RD END
