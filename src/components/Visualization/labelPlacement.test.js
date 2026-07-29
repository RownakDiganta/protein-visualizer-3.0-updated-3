// src/components/Visualization/labelPlacement.test.js
// #RD START
/* eslint-disable no-undef */
import {
  layoutAminoAcidLabels,
  layoutAminoAcidLabelsByType,
  estimateLabelWidth,
  computeRequiredLabelSpace,
  AMINO_LABEL_LANE_GAP,
  AMINO_LABEL_BASE_OFFSET,
  AMINO_LABEL_HORIZONTAL_PADDING,
  AMINO_ACID_BASE_CONNECTOR_LENGTH,
  AMINO_ACID_LANE_GAP
} from './labelPlacement';

// Two labels' intervals overlap if their [left, right] ranges (plus padding)
// intersect; used below to assert same-lane labels never visually collide.
const intervalsOverlap = (a, b, padding = 0) => {
  const aLeft = a.x - a.estimatedWidth / 2;
  const aRight = a.x + a.estimatedWidth / 2;
  const bLeft = b.x - b.estimatedWidth / 2;
  const bRight = b.x + b.estimatedWidth / 2;
  return aLeft < bRight + padding && bLeft < aRight + padding;
};

describe('layoutAminoAcidLabels', () => {
  test('a single label gets lane 0', () => {
    const layout = layoutAminoAcidLabels({
      labels: [{ x: 100, text: 'W137' }]
    });
    expect(layout).toHaveLength(1);
    expect(layout[0].lane).toBe(0);
  });

  test('labels far apart all fit in a single lane', () => {
    const layout = layoutAminoAcidLabels({
      labels: [
        { x: 100, text: 'G19' },
        { x: 500, text: 'K2750' },
        { x: 900, text: 'W137' }
      ]
    });
    expect(layout.every((label) => label.lane === 0)).toBe(true);
  });

  test('overlapping labels are pushed onto multiple lanes', () => {
    // All at nearly the same x - their text intervals must overlap regardless of
    // width, so each needs its own lane.
    const layout = layoutAminoAcidLabels({
      labels: [
        { x: 100, text: 'W137' },
        { x: 102, text: 'W140' },
        { x: 104, text: 'W142' }
      ]
    });
    const lanes = layout.map((label) => label.lane);
    expect(new Set(lanes).size).toBe(3);
  });

  test('handles labels with short and long residue numbers', () => {
    // "G9" is much narrower than "K2750" - the layout must use each label's own
    // estimated width, not a fixed assumed width, when deciding lane placement.
    const shortLabel = { x: 100, text: 'G9' };
    const longLabel = { x: 108, text: 'K2750' };
    const layout = layoutAminoAcidLabels({ labels: [shortLabel, longLabel] });
    expect(layout).toHaveLength(2);
    // The long label is wide enough to still collide with the short one at this
    // distance, so they must land on different lanes.
    expect(layout[0].lane).not.toBe(layout[1].lane);
  });

  test('labels from different amino-acid types participate in one shared layout', () => {
    // G, L, P and K (per the reported example) all landing close together must
    // collide with EACH OTHER, not just within their own letter.
    const layout = layoutAminoAcidLabels({
      labels: [
        { x: 100, text: 'G19', aminoAcid: 'G' },
        { x: 103, text: 'L20', aminoAcid: 'L' },
        { x: 106, text: 'P21', aminoAcid: 'P' },
        { x: 109, text: 'K22', aminoAcid: 'K' }
      ]
    });
    const lanes = layout.map((label) => label.lane);
    // They can't all be lane 0 - at least some must be pushed to other lanes.
    expect(new Set(lanes).size).toBeGreaterThan(1);
  });

  test('above and below layouts are independent of each other', () => {
    const aboveLabels = [
      { x: 100, text: 'W137' },
      { x: 102, text: 'W140' }
    ];
    const belowLabels = [{ x: 100, text: 'K22' }];

    const aboveLayout = layoutAminoAcidLabels({
      labels: aboveLabels,
      side: 'above'
    });
    const belowLayout = layoutAminoAcidLabels({
      labels: belowLabels,
      side: 'below'
    });

    // The below layout must not be affected by however crowded "above" was.
    expect(belowLayout[0].lane).toBe(0);
    expect(belowLayout.every((label) => label.side === 'below')).toBe(true);
    expect(aboveLayout.every((label) => label.side === 'above')).toBe(true);
  });

  test('output is deterministic for identical input', () => {
    const labels = [
      { x: 140, text: 'W140' },
      { x: 100, text: 'G100' },
      { x: 105, text: 'L105' },
      { x: 500, text: 'K500' }
    ];
    const first = layoutAminoAcidLabels({ labels });
    const second = layoutAminoAcidLabels({ labels });
    expect(second).toEqual(first);
  });

  test('no label is ever dropped - output length always matches input length', () => {
    const labels = Array.from({ length: 25 }, (_, i) => ({
      x: 100 + i * 2,
      text: `W${100 + i}`
    }));
    const layout = layoutAminoAcidLabels({ labels });
    expect(layout).toHaveLength(labels.length);
  });

  test('no two labels assigned to the same lane have overlapping intervals', () => {
    // A mix of clustered and spread-out labels of varying text length.
    const labels = [
      { x: 50, text: 'G9' },
      { x: 100, text: 'W101' },
      { x: 103, text: 'W104' },
      { x: 106, text: 'K2750' },
      { x: 109, text: 'L22' },
      { x: 300, text: 'P30' },
      { x: 700, text: 'T7000' }
    ];
    const layout = layoutAminoAcidLabels({
      labels,
      horizontalPadding: AMINO_LABEL_HORIZONTAL_PADDING
    });

    const laneGroups = {};
    layout.forEach((label) => {
      laneGroups[label.lane] = laneGroups[label.lane] || [];
      laneGroups[label.lane].push(label);
    });

    Object.values(laneGroups).forEach((group) => {
      for (let i = 0; i < group.length; i += 1) {
        for (let j = i + 1; j < group.length; j += 1) {
          expect(intervalsOverlap(group[i], group[j])).toBe(false);
        }
      }
    });
  });

  test('preserves the original input order in its return value', () => {
    const labels = [
      { x: 500, text: 'K500' },
      { x: 100, text: 'G100' },
      { x: 105, text: 'L105' }
    ];
    const layout = layoutAminoAcidLabels({ labels });
    expect(layout.map((label) => label.text)).toEqual([
      'K500',
      'G100',
      'L105'
    ]);
  });
});

describe('estimateLabelWidth', () => {
  test('longer residue numbers produce a wider estimate than shorter ones', () => {
    expect(estimateLabelWidth('K2750')).toBeGreaterThan(
      estimateLabelWidth('G9')
    );
  });
});

describe('computeRequiredLabelSpace', () => {
  test('an empty layout requires no extra space', () => {
    expect(computeRequiredLabelSpace([])).toBe(0);
  });

  test('grows with the maximum lane used, based on baseOffset + lanes * laneGap', () => {
    const layout = [{ lane: 0 }, { lane: 1 }, { lane: 3 }];
    const space = computeRequiredLabelSpace(layout);
    // maxLane = 3 -> 4 lanes deep
    expect(space).toBeGreaterThanOrEqual(
      AMINO_LABEL_BASE_OFFSET + 4 * AMINO_LABEL_LANE_GAP
    );
  });

  test('a denser layout (more lanes) requires more space than a sparser one', () => {
    const sparse = [{ lane: 0 }, { lane: 1 }];
    const dense = [{ lane: 0 }, { lane: 1 }, { lane: 2 }, { lane: 3 }, { lane: 4 }];
    expect(computeRequiredLabelSpace(dense)).toBeGreaterThan(
      computeRequiredLabelSpace(sparse)
    );
  });
});

describe('layoutAminoAcidLabelsByType (full-length overview: one compact level per type)', () => {
  test('a single selected amino acid produces one compact level at the base connector length', () => {
    const labels = [
      { x: 50, text: 'W20', aminoAcid: 'W' },
      { x: 400, text: 'W250', aminoAcid: 'W' },
      { x: 900, text: 'W900', aminoAcid: 'W' }
    ];
    const layout = layoutAminoAcidLabelsByType({ labels });
    expect(layout).toHaveLength(3);
    expect(new Set(layout.map((label) => label.lane)).size).toBe(1);
    expect(layout[0].lane).toBe(0);
    expect(layout[0].y).toBe(AMINO_ACID_BASE_CONNECTOR_LENGTH);
  });

  test('all labels of the same amino-acid type receive the exact same y-coordinate, however close together in x', () => {
    // ~5px apart with wide multi-digit text - would have collided under the old
    // sub-lane algorithm, but must now stay on one shared level.
    const labels = [
      { x: 100, text: 'W989', aminoAcid: 'W' },
      { x: 105, text: 'W1044', aminoAcid: 'W' }
    ];
    const layout = layoutAminoAcidLabelsByType({ labels });
    expect(layout).toHaveLength(2);
    expect(layout[0].lane).toBe(layout[1].lane);
    expect(layout[0].y).toBe(layout[1].y);
  });

  test('dense labels of the same type (5 residues nearly overlapping in x) all remain on one level - no sub-lane assigned', () => {
    const labels = [
      { x: 100, text: 'W100', aminoAcid: 'W' },
      { x: 102, text: 'W102', aminoAcid: 'W' },
      { x: 104, text: 'W104', aminoAcid: 'W' },
      { x: 106, text: 'W106', aminoAcid: 'W' },
      { x: 108, text: 'W108', aminoAcid: 'W' }
    ];
    const layout = layoutAminoAcidLabelsByType({ labels });
    expect(layout).toHaveLength(5);
    // Every label shares the exact same y - one level, regardless of density.
    expect(new Set(layout.map((label) => label.y)).size).toBe(1);
    // No sub-lane field exists anywhere in the full-length output.
    layout.forEach((label) => {
      expect(label.subLane).toBeUndefined();
    });
    // Deterministic across repeated runs on identical input.
    const second = layoutAminoAcidLabelsByType({ labels });
    expect(second).toEqual(layout);
  });

  test('mixed W and V labels: different types land on different, deterministic levels', () => {
    const labels = [
      { x: 100, text: 'W100', aminoAcid: 'W' },
      { x: 102, text: 'W102', aminoAcid: 'W' },
      { x: 100, text: 'V100', aminoAcid: 'V' },
      { x: 102, text: 'V102', aminoAcid: 'V' }
    ];
    const layout = layoutAminoAcidLabelsByType({ labels });
    const wLayout = layout.filter((label) => label.aminoAcid === 'W');
    const vLayout = layout.filter((label) => label.aminoAcid === 'V');

    // Different levels (lane and y) between types...
    expect(wLayout[0].lane).not.toBe(vLayout[0].lane);
    expect(wLayout[0].y).not.toBe(vLayout[0].y);
    // ...but every same-type label still shares one exact y.
    expect(wLayout[0].y).toBe(wLayout[1].y);
    expect(vLayout[0].y).toBe(vLayout[1].y);
  });

  test('four selected amino-acid types produce four distinct, compact levels', () => {
    const makeCluster = (aminoAcid, startX) => [
      { x: startX, text: `${aminoAcid}100`, aminoAcid },
      { x: startX + 2, text: `${aminoAcid}102`, aminoAcid },
      { x: startX + 4, text: `${aminoAcid}104`, aminoAcid }
    ];
    const labels = [
      ...makeCluster('W', 100),
      ...makeCluster('L', 100),
      ...makeCluster('V', 100),
      ...makeCluster('C', 100)
    ];
    const layout = layoutAminoAcidLabelsByType({ labels });
    expect(layout).toHaveLength(labels.length);

    const yByType = {};
    ['W', 'L', 'V', 'C'].forEach((aminoAcid) => {
      const group = layout.filter((label) => label.aminoAcid === aminoAcid);
      // Every label of this type shares one exact y (one compact level).
      expect(new Set(group.map((label) => label.y)).size).toBe(1);
      yByType[aminoAcid] = group[0].y;
    });

    // All four types land on different levels.
    expect(new Set(Object.values(yByType)).size).toBe(4);
    // Levels are tightly, deterministically spaced by AMINO_ACID_LANE_GAP.
    const sortedYs = Object.values(yByType).sort((a, b) => a - b);
    for (let i = 1; i < sortedYs.length; i += 1) {
      expect(sortedYs[i] - sortedYs[i - 1]).toBe(AMINO_ACID_LANE_GAP);
    }
  });

  test('lane assignment is deterministic: first-encountered type always gets lane 0, in order', () => {
    const labels = [
      { x: 500, text: 'K500', aminoAcid: 'K' },
      { x: 100, text: 'G100', aminoAcid: 'G' },
      { x: 105, text: 'L105', aminoAcid: 'L' }
    ];
    const first = layoutAminoAcidLabelsByType({ labels });
    const second = layoutAminoAcidLabelsByType({ labels });
    expect(second).toEqual(first);
    expect(first.find((label) => label.aminoAcid === 'K').lane).toBe(0);
    expect(first.find((label) => label.aminoAcid === 'G').lane).toBe(1);
    expect(first.find((label) => label.aminoAcid === 'L').lane).toBe(2);
  });

  test('residue x-coordinates are preserved unchanged', () => {
    const labels = [
      { x: 123.4, text: 'W100', aminoAcid: 'W' },
      { x: 567.8, text: 'L105', aminoAcid: 'L' }
    ];
    const layout = layoutAminoAcidLabelsByType({ labels });
    expect(layout.find((label) => label.aminoAcid === 'W').x).toBe(123.4);
    expect(layout.find((label) => label.aminoAcid === 'L').x).toBe(567.8);
  });

  test('no label is ever dropped - output length always matches input length', () => {
    const labels = Array.from({ length: 25 }, (_, i) => ({
      x: 100 + i * 2,
      text: `W${100 + i}`,
      aminoAcid: 'W'
    }));
    const layout = layoutAminoAcidLabelsByType({ labels });
    expect(layout).toHaveLength(labels.length);
  });

  test('preserves the original input order in its return value', () => {
    const labels = [
      { x: 500, text: 'K500', aminoAcid: 'K' },
      { x: 100, text: 'G100', aminoAcid: 'G' },
      { x: 105, text: 'L105', aminoAcid: 'L' }
    ];
    const layout = layoutAminoAcidLabelsByType({ labels });
    expect(layout.map((label) => label.text)).toEqual([
      'K500',
      'G100',
      'L105'
    ]);
  });

  test("Q9H5I5-style dense W cluster (incl. a second W at position 137) stays on the one W level", () => {
    // Regression case for the reported Q9H5I5 collision: a second W landing very
    // close to a first W (position 137) must stay on the exact same W level -
    // no sub-lane shift - while a co-selected type (K) keeps its own separate
    // level.
    const labels = [
      { x: 120, text: 'W130', aminoAcid: 'W' },
      { x: 124, text: 'W137', aminoAcid: 'W' },
      { x: 130, text: 'K140', aminoAcid: 'K' }
    ];
    const layout = layoutAminoAcidLabelsByType({ labels });
    const wLayout = layout.filter((label) => label.aminoAcid === 'W');
    const kLayout = layout.filter((label) => label.aminoAcid === 'K');
    expect(wLayout).toHaveLength(2);
    expect(wLayout[0].lane).toBe(wLayout[1].lane);
    expect(wLayout[0].y).toBe(wLayout[1].y);
    expect(kLayout[0].lane).not.toBe(wLayout[0].lane);
    expect(kLayout[0].y).not.toBe(wLayout[0].y);
  });

  test('above and below sides are both labelled correctly and independently leveled', () => {
    const denseW = [
      { x: 100, text: 'W100', aminoAcid: 'W' },
      { x: 102, text: 'W102', aminoAcid: 'W' }
    ];
    const aboveLayout = layoutAminoAcidLabelsByType({
      labels: denseW,
      side: 'above'
    });
    const belowLayout = layoutAminoAcidLabelsByType({
      labels: denseW,
      side: 'below'
    });

    expect(aboveLayout.every((label) => label.side === 'above')).toBe(true);
    expect(belowLayout.every((label) => label.side === 'below')).toBe(true);
    // Same one-level-per-type geometry regardless of side (the sign/direction
    // is applied later, during drawing).
    expect(aboveLayout.map((label) => label.y)).toEqual(
      belowLayout.map((label) => label.y)
    );
  });

  test('lane spacing uses the shared geometry constants (no magic numbers)', () => {
    const labels = [
      { x: 50, text: 'W20', aminoAcid: 'W' },
      { x: 52, text: 'W22', aminoAcid: 'W' },
      { x: 200, text: 'L21', aminoAcid: 'L' }
    ];
    const layout = layoutAminoAcidLabelsByType({ labels });
    const w0 = layout.find((label) => label.text === 'W20');
    const w1 = layout.find((label) => label.text === 'W22');
    const lLabel = layout.find((label) => label.aminoAcid === 'L');

    expect(w0.y).toBe(AMINO_ACID_BASE_CONNECTOR_LENGTH);
    // Same type -> same level, not a sub-lane offset.
    expect(w1.y).toBe(AMINO_ACID_BASE_CONNECTOR_LENGTH);
    expect(lLabel.y).toBe(AMINO_ACID_BASE_CONNECTOR_LENGTH + AMINO_ACID_LANE_GAP);
  });
});
// #RD END
