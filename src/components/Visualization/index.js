// src/components/Visualization/index.js
// Core D3 rendering engine: draws the full protein "spine" SVG (domains, disulfide
// bonds, glycosylation, phosphosites, free residues) plus the zoomable window view.
import React, { useRef, useEffect, useState } from 'react';
import { select, scaleLinear, selectAll } from 'd3';
import PropTypes from 'prop-types';
import constants from '../../static/constants';
import Legend from '../Legend';
import ProteinWindow from './ProteinWindow';
// #RD START
import {
  AMINO_LABEL_FONT_SIZE,
  AMINO_LABEL_HORIZONTAL_PADDING,
  AMINO_LABEL_LANE_GAP,
  AMINO_LABEL_BASE_OFFSET,
  AMINO_LABEL_MAX_VISIBLE_LANES,
  AMINO_ACID_BASE_CONNECTOR_LENGTH,
  AMINO_ACID_LANE_GAP,
  AMINO_LABEL_SAFETY_BUFFER,
  layoutAminoAcidLabels,
  layoutAminoAcidLabelsByType,
  computeRequiredLabelSpace
} from './labelPlacement';
// #RD END

import './index.scss';

const CIRCLE_RADIUS = 5;
const SPINE_HEIGHT = 30;

const { COLOR_PALLETE } = constants;
// #RD START
const {
  AMINO_ACIDS,
  AMINO_ACID_RENDER_STYLE,
  DEFAULT_AMINO_ACID_RENDER_STYLE,
  MAX_SELECTED_AMINO_ACIDS,
  SELECTED_AMINO_ACID_COLORS
} = constants;
// #RD END

const calculateBondRanking = (array) => {
  const pairRanking = [];
  array.forEach((pair, idx) => {
    let total = 1;
    const [currLow, currHigh] = pair;
    for (let i = 0; i < array.length; i += 1) {
      if (idx !== i) {
        const [arrLow, arrHigh] = array[i];
        if (currLow < arrLow && currHigh > arrHigh) {
          total += 1;
        }
        if (currLow < arrLow && currHigh > arrLow && currHigh < arrHigh) {
          total += 0.55;
        }
        if (currLow > arrLow && currLow < arrHigh && currHigh > arrHigh) {
          total += 0.75;
        }
      }
    }
    pairRanking.push(total);
  });
  return pairRanking;
};

function Visualization(props) {
  const {
    height,
    width: initialWidth,
    currSelection,
    isLegendOpen,
    initialOptions,
    scaleFactor,
    fullScale,
    setFullScaleDisabled
  } = props;

  const {
    disulfideBonds,
    glycoslation,
    o_glcnac,
    o_glc,
    glycation,
    phosphoserine,
    phosphothreonine,
    phosphotyrosine,
    length: proteinLength,
    outsideDomain,
    insideDomain,
    sequons,
    cysteines,
    // #RD OLD CODE
    // freeS,
    // freeT,
    // freeK,
    // freeW,
    // #RD END OLD CODE
    // #RD START
    aminoAcids = {},
    // #RD END
    species
  } = initialOptions[currSelection];

  console.log('Visualization -> proteinLength', proteinLength);

  const svgRef = useRef(null);
  const windowSvgRef = useRef(null);
  const [windowPos, setWindowPos] = useState({ start: 0, end: proteinLength });
  const { start: windowStart, end: windowEnd } = windowPos;
  const [windowView, setWindowView] = useState(false);
  const [showGlyco, setShowGlyco] = useState(true);
  const [showDisulfide, setShowDisulfide] = useState(true);
  const [showOutsideDomain, setShowOutisde] = useState(true);
  const [showInsideDomain, setShowInside] = useState(true);
  const [showSequons, setShowSequons] = useState(false);
  const [showCysteines, setShowCysteines] = useState(false);
  // #RD OLD CODE
  // const [showFreeS, setShowFreeS] = useState(false);
  // const [showFreeT, setShowFreeT] = useState(false);
  // const [showFreeK, setShowFreeK] = useState(false);
  // const [showFreeW, setShowFreeW] = useState(false);
  // #RD END OLD CODE
  // #RD START
  // selectedAminoAcids now holds a mix of amino-acid letters (e.g. "W") AND
  // modification keys (e.g. "phosphoserine") - one shared array/limit for both,
  // per the "amino acids and mods" selector panel (see Legend/index.js). The
  // toggle function itself is unchanged: it only ever pushes/removes a string,
  // so it works identically for either kind of key.
  const [selectedAminoAcids, setSelectedAminoAcids] = useState([]);

  const toggleAminoAcidSelection = (aminoAcid) => {
    setSelectedAminoAcids((prev) => {
      if (prev.includes(aminoAcid)) {
        return prev.filter((el) => el !== aminoAcid);
      }
      if (prev.length >= MAX_SELECTED_AMINO_ACIDS) {
        return prev;
      }
      return [...prev, aminoAcid];
    });
  };

  // Visibility for the 6 migrated modification types is now derived directly
  // from selection membership (visible once selected, like amino acids already
  // were) instead of independent always-on booleans - replaces the old
  // showOGalNAc/showOGlc/showGlycation/showPhosphoserine/showPhosphothreonine/
  // showPhosphotyrosine useState hooks. Recomputed each render from
  // selectedAminoAcids, so no separate effect/dependency is needed.
  const showOGalNAc = selectedAminoAcids.includes('o_glcnac');
  const showOGlc = selectedAminoAcids.includes('o_glc');
  const showGlycation = selectedAminoAcids.includes('glycation');
  const showPhosphoserine = selectedAminoAcids.includes('phosphoserine');
  const showPhosphothreonine = selectedAminoAcids.includes('phosphothreonine');
  const showPhosphotyrosine = selectedAminoAcids.includes('phosphotyrosine');
  // #RD END

  const scaleVisualization = scaleFactor !== 1;
  const scaledWidth = initialWidth * scaleFactor;

  const margin = {
    top: height / 15,
    right: initialWidth / 15,
    bottom: height / 15,
    left: initialWidth / 10
  };
  const innerHeight = height - margin.top - margin.bottom;
  const SULFIDE_POS = innerHeight / 2 + SPINE_HEIGHT / 2;
  const SULFIDE_BOND_LENGTH = 40;
  const SULFIDE_ATOM_OFFSET = 20;
  const GLYCO_STEM_LENGTH = 60;
  const GLYCO_LINK_LENGTH = 10;
  const SPINE_START_POS = 30;

  // #RD START
  // Reserves horizontal space, for the FULL-LENGTH view only, matching the
  // fixed-position Legend (left) and "Amino acids and mods" (right) panels -
  // see .legend--wrapper (left: 10px, width: 250px) and .legend--wrapperRight
  // (right: 10px, width: 300px) in Legend/index.scss. Those panels are
  // position: fixed, so they're painted in the same viewport-relative layer
  // regardless of where the diagram sits in normal document flow; moving the
  // diagram higher up the page (see VISUALIZATION_HEIGHT_CAP in App.jsx) put
  // it in the exact vertical band the panels already occupied. The diagram's
  // old left/right breathing room (margin.left, ~10% of viewport width, used
  // on BOTH sides) was never actually tied to the panels' real footprint -
  // measuring confirmed the drawing group's own origin (translateX) landed
  // well inside the Legend panel's right edge, so residue labels, connector
  // lines, and even the NH2 terminus label rendered underneath it, and the
  // COOH terminus label rendered underneath the right panel.
  //
  // Values below are kept in sync by hand with Legend/index.scss's panel
  // widths (SCSS and this JS module can't literally share one constant) plus
  // a gap wide enough for this view's own edge content (the NH2 label
  // extends further left of the spine's start, the COOH label extends
  // further right of the spine's end) - confirmed with real on-screen
  // measurements, not just the panels' bare CSS widths.
  const LEFT_PANEL_RESERVED_WIDTH = 320; // legend--wrapper: 10 + 250, + ~60px gap for the NH2 label
  const RIGHT_PANEL_RESERVED_WIDTH = 430; // legend--wrapperRight: 10 + 300, + ~120px gap for the COOH label
  // #RD END

  // #RD START
  // Below some viewport width, LEFT_PANEL_RESERVED_WIDTH + RIGHT_PANEL_RESERVED_WIDTH
  // (750px combined) no longer fits, which drove SPINE_WIDTH negative at a 700px-wide
  // viewport - confirmed by measurement. A negative width doesn't just shrink the
  // diagram, it flips the residue-position scale's direction, so labels render out of
  // sequence order and pile on top of each other (a real rendering bug, distinct from
  // "cramped but correct"). The *_PANEL_MIN_RESERVED_WIDTH values below are the bare
  // minimum that still clears the panel itself plus the terminus label's own bleed
  // past the spine (measured empirically, same as the ideal values above) - the only
  // thing the ideal values add on top is a few px of pure breathing room, which is
  // what gets dropped first as the viewport narrows. MIN_SPINE_WIDTH is a last-resort
  // floor for the (very narrow, below-any-panel-fit) case where even the bare-minimum
  // reservation leaves no room - it trades a visually tiny diagram for never
  // re-inverting or overlapping either panel.
  const LEFT_PANEL_MIN_RESERVED_WIDTH = 285;
  const RIGHT_PANEL_MIN_RESERVED_WIDTH = 375;
  const MIN_SPINE_WIDTH = 30;
  const idealAvailableWidth =
    scaledWidth -
    scaleFactor * (LEFT_PANEL_RESERVED_WIDTH + RIGHT_PANEL_RESERVED_WIDTH);
  const isReservationTight = idealAvailableWidth < MIN_SPINE_WIDTH;
  const EFFECTIVE_LEFT_RESERVED_WIDTH = isReservationTight
    ? LEFT_PANEL_MIN_RESERVED_WIDTH
    : LEFT_PANEL_RESERVED_WIDTH;
  const EFFECTIVE_RIGHT_RESERVED_WIDTH = isReservationTight
    ? RIGHT_PANEL_MIN_RESERVED_WIDTH
    : RIGHT_PANEL_RESERVED_WIDTH;
  // #RD END

  const SPINE_WIDTH = Math.max(
    MIN_SPINE_WIDTH,
    scaledWidth -
      scaleFactor *
        (EFFECTIVE_LEFT_RESERVED_WIDTH + EFFECTIVE_RIGHT_RESERVED_WIDTH)
  );

  // #RD START
  // Window view gets its OWN (much smaller) side margin instead of reusing
  // the full-length view's margin.left (10% of width, reserved there mostly
  // for the "NH2 --"/"-- COOH" terminus labels). The window view never draws
  // those labels (see the `!isWindowView` guard around
  // attachNTerminus/attachCTerminus below), so reusing that same wide margin
  // was pure unused space - this was reported as "the lower visualization
  // uses far less of the available width than the full-length one," and
  // measuring confirmed the window protein bar previously stopped at ~81% of
  // the SVG's width with nothing drawn in the remaining ~19%.
  //
  // The window view's whole drawing group is already shifted right by
  // WINDOW_VIEW_TRANSLATE_X (see translateX in renderVisualization below) -
  // that offset must be subtracted from the width budget here, or content
  // sized against the full initialWidth overflows past the SVG's own right
  // edge. That overflow is invisible in the browser (the SVG has
  // overflow="visible", so it just bleeds past the element's box) but is
  // genuinely clipped in PNG/PDF exports, which render only the SVG's
  // declared width/height - confirmed by measuring the live DOM before this
  // fix (a domain rect's rendered right edge landed ~65px past the SVG's
  // own 1400px-wide bounding box).
  const WINDOW_VIEW_TRANSLATE_X = initialWidth / 15;
  const WINDOW_SPINE_MARGIN_RATIO = 0.02;
  const WINDOW_SPINE_START_POS = initialWidth * WINDOW_SPINE_MARGIN_RATIO;
  const WINDOW_SPINE_WIDTH =
    initialWidth -
    WINDOW_VIEW_TRANSLATE_X -
    2 * initialWidth * WINDOW_SPINE_MARGIN_RATIO;
  // #RD END

  // #RD START
  // Builds ONE shared label layout per side (above/below the spine) across ALL
  // currently-selected amino acids for a given view. This is computed as plain
  // data here (not inside the D3 drawing code) so the same result can size the
  // SVG/container (see fullAminoAcidLayout/windowAminoAcidLayout below) and be
  // handed to the D3 render step, guaranteeing both use identical positions.
  // Re-running this is cheap (plain array math over at most a few hundred
  // residue positions) and recalculates automatically on every render, so it
  // responds to width/scale changes (responsive) and window-view changes
  // without any extra memoization machinery.
  //
  // The full-length view (isWindowView === false) uses
  // layoutAminoAcidLabelsByType: one fixed, compact lane per selected
  // amino-acid TYPE, so every occurrence of the same amino acid shares the
  // exact same connector length/height while different amino acids get
  // different (tightly-spaced) ones - this is an overview, so dense same-type
  // clusters are allowed to overlap in x rather than being pushed onto
  // per-residue sub-lanes. The zoomed window view keeps the collision-aware
  // lane packing (layoutAminoAcidLabels), which lanes individual residue
  // occurrences regardless of type, for exact/readable positions.
  const buildAminoAcidLabelLayout = (isWindowView) => {
    const aboveLabels = [];
    const belowLabels = [];

    // selectedAminoAcids may also contain modification keys (see above) - only
    // actual amino-acid letters get a label/connector lane here, and their
    // lane/color assignment is based on their order among ONLY the letters, so
    // an amino acid's rendering never shifts depending on which/how many
    // modifications happen to be selected alongside it.
    const selectedAminoAcidLetters = selectedAminoAcids.filter((key) =>
      AMINO_ACIDS.includes(key)
    );

    selectedAminoAcidLetters.forEach((aminoAcid, aminoAcidLane) => {
      const style =
        AMINO_ACID_RENDER_STYLE[aminoAcid] || DEFAULT_AMINO_ACID_RENDER_STYLE;
      const color =
        SELECTED_AMINO_ACID_COLORS[
          aminoAcidLane % SELECTED_AMINO_ACID_COLORS.length
        ];
      const freePositions = aminoAcids[aminoAcid]
        ? aminoAcids[aminoAcid].free
        : [];

      let seq = freePositions.map((el) => parseInt(el, 10));
      if (isWindowView) {
        seq = seq.filter((pos) => pos >= windowStart && pos <= windowEnd);
      }

      seq.forEach((position) => {
        const seqProportion = position / proteinLength;
        const windowProportion =
          (position - windowPos.start) / (windowPos.end - windowPos.start);
        const x = isWindowView
          ? WINDOW_SPINE_START_POS + windowProportion * WINDOW_SPINE_WIDTH
          : SPINE_START_POS + seqProportion * SPINE_WIDTH;

        const labelDescriptor = {
          aminoAcid,
          position,
          x,
          text: `${aminoAcid}${position}`,
          color,
          textDistance: style.textDistance
        };

        if (style.visualize === 'solid') {
          aboveLabels.push(labelDescriptor);
        } else {
          belowLabels.push(labelDescriptor);
        }
      });
    });

    // Window view uses the collision-aware packer's own param names
    // (fontSize/horizontalPadding/laneGap/baseOffset); the full-length view's
    // one-lane-per-type packer takes only baseConnectorLength/laneGap - kept as
    // two separate config objects so neither call silently ignores props meant
    // for the other function.
    const windowLayoutConfig = {
      fontSize: AMINO_LABEL_FONT_SIZE,
      horizontalPadding: AMINO_LABEL_HORIZONTAL_PADDING,
      laneGap: AMINO_LABEL_LANE_GAP,
      baseOffset: AMINO_LABEL_BASE_OFFSET
    };
    const fullLayoutConfig = {
      baseConnectorLength: AMINO_ACID_BASE_CONNECTOR_LENGTH,
      laneGap: AMINO_ACID_LANE_GAP
    };
    const layoutSideLabels = isWindowView
      ? layoutAminoAcidLabels
      : layoutAminoAcidLabelsByType;
    const layoutConfig = isWindowView ? windowLayoutConfig : fullLayoutConfig;
    const aboveLayout = layoutSideLabels({
      labels: aboveLabels,
      side: 'above',
      ...layoutConfig
    });
    const belowLayout = layoutSideLabels({
      labels: belowLabels,
      side: 'below',
      ...layoutConfig
    });

    // The full-length view's type lanes are spaced AMINO_ACID_LANE_GAP apart -
    // computeRequiredLabelSpace must be told that explicitly, or it would
    // under-size the SVG using its collision-aware defaults and clip the
    // outermost type's labels.
    const requiredSpaceConfig = isWindowView
      ? undefined
      : {
          laneGap: AMINO_ACID_LANE_GAP,
          baseOffset: AMINO_ACID_BASE_CONNECTOR_LENGTH,
          buffer: AMINO_LABEL_SAFETY_BUFFER
        };
    const requiredAboveSpace = computeRequiredLabelSpace(
      aboveLayout,
      requiredSpaceConfig
    );
    const requiredBelowSpace = computeRequiredLabelSpace(
      belowLayout,
      requiredSpaceConfig
    );

    const maxLanesAbove = aboveLayout.reduce(
      (max, label) => Math.max(max, label.lane + 1),
      0
    );
    const maxLanesBelow = belowLayout.reduce(
      (max, label) => Math.max(max, label.lane + 1),
      0
    );
    if (
      maxLanesAbove > AMINO_LABEL_MAX_VISIBLE_LANES ||
      maxLanesBelow > AMINO_LABEL_MAX_VISIBLE_LANES
    ) {
      // Informational only - lanes are never capped/truncated because of this;
      // it just flags unusually dense selections during development.
      console.warn(
        `Visualization -> amino-acid label lanes (${maxLanesAbove} above, ${maxLanesBelow} below) exceed the typical expected maximum (${AMINO_LABEL_MAX_VISIBLE_LANES}); the SVG is expanded to fit them regardless.`
      );
    }

    return { aboveLayout, belowLayout, requiredAboveSpace, requiredBelowSpace };
  };

  const fullAminoAcidLayout = buildAminoAcidLabelLayout(false);
  const windowAminoAcidLayout = buildAminoAcidLabelLayout(true);

  // Extra pixels needed, beyond the existing default margins, so the farthest
  // above/below label lane isn't pushed past the SVG's own layout box - grows
  // dynamically with however many lanes the current selection actually needs,
  // instead of assuming a fixed small number of lanes.
  const computeExtraVerticalSpace = (layout) => ({
    extraTop: Math.max(0, layout.requiredAboveSpace - SULFIDE_POS),
    extraBottom: Math.max(
      0,
      layout.requiredBelowSpace - (innerHeight - SULFIDE_POS)
    )
  });
  const fullExtraSpace = computeExtraVerticalSpace(fullAminoAcidLayout);
  const windowExtraSpace = computeExtraVerticalSpace(windowAminoAcidLayout);
  // #RD END

  const glycoBonds = initialOptions[currSelection].disulfideBonds.map(
    (pair) => {
      const bondPos = [];
      const atoms = pair.split(' ');
      atoms.forEach((el) => {
        const atom = parseInt(el, 10);
        bondPos.push(atom);
      });
      return bondPos;
    }
  );

  const updateWindowStart = (newStart) => {
    setWindowPos({ ...windowPos, start: parseInt(newStart, 10) });
  };

  const updateWindowEnd = (newEnd) => {
    setWindowPos({ ...windowPos, end: parseInt(newEnd, 10) });
  };

  if (proteinLength < 3000) {
    setFullScaleDisabled(true);
  } else {
    setFullScaleDisabled(false);
  }
  const pairRanking = calculateBondRanking(glycoBonds);
  const makePairRankArray = (array) => {
    let arr = [];
    array.forEach((pair, idx) => {
      let entry = {
        bond: pair,
        index: idx,
        rank: pairRanking[idx]
      };
      arr.push(entry);
    });
    return arr;
  };
  const pairRankArray = makePairRankArray(glycoBonds);

  const xScale = scaleLinear()
    .domain([0, proteinLength])
    .range([
      fullScale ? 0 : SPINE_START_POS,
      fullScale ? proteinLength : SPINE_WIDTH
    ]);

  const windowScale = scaleLinear()
    .domain([windowStart, windowEnd])
    .range([
      fullScale ? 0 : WINDOW_SPINE_START_POS,
      fullScale ? proteinLength : WINDOW_SPINE_WIDTH
    ]);

  const toggleWindowView = () => {
    setWindowView(!windowView);
  };

  const bondHeight = (bond) => {
    const [x, y] = bond;
    let rightIdx = 0;
    for (let i = 0; i < pairRankArray.length; i += 1) {
      const [arrX, arrY] = pairRankArray[i].bond;
      if (x == arrX && y == arrY) {
        rightIdx = i;
        break;
      }
    }
    const bHeight = SULFIDE_POS + SULFIDE_BOND_LENGTH * pairRanking[rightIdx];
    return bHeight;
  };

  const attachGlycoBonds = (g, isWindowView) => {
    let gBonds = glycoslation.map((el) => parseInt(el, 10));
    if (isWindowView) {
      gBonds = gBonds.filter(
        (bond) => bond >= windowStart && bond <= windowEnd
      );
    }

    // const scale = isWindowView ? windowScale : xScale;
    gBonds.forEach((el) => {
      let bondProportion = el / proteinLength;
      let windowProportion =
        (el - windowPos.start) / (windowPos.end - windowPos.start);
      let bondPos = isWindowView
        ? WINDOW_SPINE_START_POS + windowProportion * WINDOW_SPINE_WIDTH
        : SPINE_START_POS + bondProportion * SPINE_WIDTH;

      const atom = g.append('text');

      atom
        .attr('dx', bondPos - 8)
        .attr('dy', SULFIDE_POS - GLYCO_STEM_LENGTH - GLYCO_LINK_LENGTH * 5.5)
        .text(() => `N`)
        .attr('class', 'glyco-labels');

      const pos = g.append('text');
      pos
        .attr('dx', bondPos + 4)
        .attr('dy', SULFIDE_POS - GLYCO_STEM_LENGTH - GLYCO_LINK_LENGTH * 5.0)
        .text(() => `${el}`)
        .attr('class', 'glyco-labels--pos');

      const stem = g.append('line');
      stem
        .attr('x1', bondPos)
        .attr('y1', SULFIDE_POS - 10)
        .attr('x2', bondPos)
        .attr('y2', SULFIDE_POS - GLYCO_STEM_LENGTH)
        .style('stroke', 'black');

      const mol1 = g.append('rect');
      mol1
        .attr('width', 14)
        .attr('height', 14)
        .attr('x', bondPos - 7)
        .attr('y', SULFIDE_POS - GLYCO_STEM_LENGTH)
        .style('fill', 'blue')
        .style('stroke', 'black');

      const link = g.append('line');
      link
        .attr('x1', bondPos)
        .attr('y1', SULFIDE_POS - GLYCO_STEM_LENGTH)
        .attr('x2', bondPos)
        .attr('y2', SULFIDE_POS - GLYCO_STEM_LENGTH - GLYCO_LINK_LENGTH * 2)
        .style('stroke', 'black');

      const link2 = g.append('line');
      link2
        .attr('x1', bondPos)
        .attr('y1', SULFIDE_POS - GLYCO_STEM_LENGTH - GLYCO_LINK_LENGTH * 2)
        .attr('x2', bondPos)
        .attr('y2', SULFIDE_POS - GLYCO_STEM_LENGTH - GLYCO_LINK_LENGTH * 3.5)
        .style('stroke', 'black');

      const mol2 = g.append('rect');
      mol2
        .attr('width', 14)
        .attr('height', 14)
        .attr('x', bondPos - 7)
        .attr('y', SULFIDE_POS - GLYCO_STEM_LENGTH - GLYCO_LINK_LENGTH * 2)
        .style('fill', 'blue')
        .style('stroke', 'black');

      const mol3 = g.append('circle');
      mol3
        .attr('cx', bondPos)
        .attr('cy', SULFIDE_POS - GLYCO_STEM_LENGTH - GLYCO_LINK_LENGTH * 3.5)
        .attr('r', CIRCLE_RADIUS + 3)
        .style('stroke', 'black')
        .style('fill', 'green');
    });
  };

  const attachOGalNAcBonds = (g, isWindowView) => {
    let oBonds = o_glcnac.map((el) => parseInt(el, 10));
    if (isWindowView) {
      oBonds = oBonds.filter(
        (bond) => bond >= windowStart && bond <= windowEnd
      );
    }
    oBonds.forEach((el) => {
      let bondProportion = el / proteinLength;
      let windowProportion =
        (el - windowPos.start) / (windowPos.end - windowPos.start);
      let bondPos = isWindowView
        ? WINDOW_SPINE_START_POS + windowProportion * WINDOW_SPINE_WIDTH
        : SPINE_START_POS + bondProportion * SPINE_WIDTH;

      const atom = g.append('text');

      atom
        .attr('dx', bondPos - 8)
        .attr('dy', SULFIDE_POS - GLYCO_STEM_LENGTH * 1.15)
        .text(() => `O`)
        .attr('class', 'glyco-labels');

      const pos = g.append('text');
      pos
        .attr('dx', bondPos + 4)
        .attr('dy', SULFIDE_POS - GLYCO_STEM_LENGTH * 1.1)
        .text(() => `${el}`)
        .attr('class', 'glyco-labels--pos');

      const stem = g.append('line');
      stem
        .attr('x1', bondPos)
        .attr('y1', SULFIDE_POS - 10)
        .attr('x2', bondPos)
        .attr('y2', SULFIDE_POS - GLYCO_STEM_LENGTH)
        .style('stroke', 'black');

      const mol = g.append('rect');
      mol
        .attr('width', 14)
        .attr('height', 14)
        .attr('x', bondPos - 7)
        .attr('y', SULFIDE_POS - GLYCO_STEM_LENGTH)
        .style('stroke', 'black')
        .style('fill', 'yellow');
    });
  };

  const attachOGlcBonds = (g, isWindowView) => {
    let oBonds = o_glc.map((el) => parseInt(el, 10));
    if (isWindowView) {
      oBonds = oBonds.filter(
        (bond) => bond >= windowStart && bond <= windowEnd
      );
    }
    oBonds.forEach((el) => {
      let bondProportion = el / proteinLength;
      let windowProportion =
        (el - windowPos.start) / (windowPos.end - windowPos.start);
      let bondPos = isWindowView
        ? WINDOW_SPINE_START_POS + windowProportion * WINDOW_SPINE_WIDTH
        : SPINE_START_POS + bondProportion * SPINE_WIDTH;

      const atom = g.append('text');

      atom
        .attr('dx', bondPos - 8)
        .attr('dy', SULFIDE_POS - GLYCO_STEM_LENGTH * 1.15)
        .text(() => `O`)
        .attr('class', 'glyco-labels');

      const pos = g.append('text');
      pos
        .attr('dx', bondPos + 4)
        .attr('dy', SULFIDE_POS - GLYCO_STEM_LENGTH * 1.1)
        .text(() => `${el}`)
        .attr('class', 'glyco-labels--pos');

      const stem = g.append('line');
      stem
        .attr('x1', bondPos)
        .attr('y1', SULFIDE_POS - 10)
        .attr('x2', bondPos)
        .attr('y2', SULFIDE_POS - GLYCO_STEM_LENGTH)
        .style('stroke', 'black');

      const mol = g.append('circle');
      mol
        .attr('cx', bondPos)
        .attr('cy', SULFIDE_POS - GLYCO_STEM_LENGTH + CIRCLE_RADIUS)
        .attr('r', CIRCLE_RADIUS + 3)
        .style('stroke', 'black')
        .style('fill', 'blue');
    });
  };

  const attachPhosphorylation = (g, isWindowView, phosphorylation, color) => {
    let phosphos = phosphorylation.map((el) => parseInt(el, 10));
    if (isWindowView) {
      phosphos = phosphos.filter(
        (phospho) => phospho >= windowStart && phospho <= windowEnd
      );
    }

    phosphos.forEach((el) => {
      let phosphoProportion = el / proteinLength;
      let windowProportion =
        (el - windowPos.start) / (windowPos.end - windowPos.start);
      let phosphoPos = isWindowView
        ? WINDOW_SPINE_START_POS + windowProportion * WINDOW_SPINE_WIDTH
        : SPINE_START_POS + phosphoProportion * SPINE_WIDTH;
      const pos = g.append('text');
      pos
        .attr('dx', phosphoPos + 4)
        .attr('dy', SULFIDE_POS - GLYCO_STEM_LENGTH * 0.8 * 0.5)
        .text(() => `${el}`)
        .attr('class', 'glyco-labels--pos');

      const stem = g.append('line');
      stem
        .attr('x1', phosphoPos)
        .attr('y1', SULFIDE_POS - 10)
        .attr('x2', phosphoPos)
        .attr('y2', SULFIDE_POS - GLYCO_STEM_LENGTH * 0.8)
        .style('stroke', 'black');

      const mol = g.append('circle');
      mol
        .attr('cx', phosphoPos)
        .attr('cy', SULFIDE_POS - GLYCO_STEM_LENGTH * 0.8 + CIRCLE_RADIUS)
        .attr('r', CIRCLE_RADIUS + 5)
        .style('fill', `${color}`);

      const atom = g.append('text');
      atom
        .attr('dx', phosphoPos - 5)
        .attr('dy', SULFIDE_POS - GLYCO_STEM_LENGTH * 0.8 + CIRCLE_RADIUS + 6)
        .text(() => `P`)
        .attr('class', 'glyco-labels');
    });
  };

  const attachGlycationBonds = (g, isWindowView) => {
    let nBonds = glycation.map((el) => parseInt(el, 10));
    if (isWindowView) {
      nBonds = nBonds.filter(
        (bond) => bond >= windowStart && bond <= windowEnd
      );
    }
    nBonds.forEach((el) => {
      let bondProportion = el / proteinLength;
      let windowProportion =
        (el - windowPos.start) / (windowPos.end - windowPos.start);
      let bondPos = isWindowView
        ? WINDOW_SPINE_START_POS + windowProportion * WINDOW_SPINE_WIDTH
        : SPINE_START_POS + bondProportion * SPINE_WIDTH;

      const atom = g.append('text');

      atom
        .attr('dx', bondPos - 8)
        .attr('dy', SULFIDE_POS - GLYCO_STEM_LENGTH * 1.15)
        .text(() => `N`)
        .attr('class', 'glyco-labels');

      const pos = g.append('text');
      pos
        .attr('dx', bondPos + 4)
        .attr('dy', SULFIDE_POS - GLYCO_STEM_LENGTH * 1.1)
        .text(() => `${el}`)
        .attr('class', 'glyco-labels--pos');

      const stem = g.append('line');
      stem
        .attr('x1', bondPos)
        .attr('y1', SULFIDE_POS - 10)
        .attr('x2', bondPos)
        .attr('y2', SULFIDE_POS - GLYCO_STEM_LENGTH)
        .style('stroke', 'black');

      const mol = g.append('circle');
      mol
        .attr('cx', bondPos)
        .attr('cy', SULFIDE_POS - GLYCO_STEM_LENGTH + CIRCLE_RADIUS)
        .attr('r', CIRCLE_RADIUS + 3)
        .style('stroke', 'black')
        .style('fill', 'blue');
    });
  };

  const attachSulfides = (g, isWindowView) => {
    let bonds = disulfideBonds.map((pair) => {
      const bondPos = [];
      const atoms = pair.split(' ');
      atoms.forEach((el) => {
        const atom = parseInt(el, 10);
        bondPos.push(atom);
      });
      return bondPos;
    });

    const scale = isWindowView ? windowScale : xScale;
    if (isWindowView) {
      bonds = bonds.filter((bond) => {
        const [x, y] = bond;
        return x >= windowStart && y <= windowEnd;
      });

      // attach bonds that arent fully in window
      // 1. Bonds that cut off to the left

      const leftBonds = disulfideBonds.filter((b) => {
        const [x, y] = b.split(' ');
        const b1 = parseInt(x, 10);
        const b2 = parseInt(y, 10);
        return b1 < windowStart && b2 <= windowEnd && b2 > windowStart;
      });

      console.log('attachSulfides -> leftBonds', leftBonds);

      leftBonds.forEach((pair, idx) => {
        const [x, y] = pair.split(' ');
        // attach sulfide
        let bondProportion = y / proteinLength;
        let windowProportion =
          (y - windowPos.start) / (windowPos.end - windowPos.start);
        let bondPos = isWindowView
          ? WINDOW_SPINE_START_POS + windowProportion * WINDOW_SPINE_WIDTH
          : SPINE_START_POS + bondProportion * SPINE_WIDTH;

        const atom = g.append('circle');
        atom
          .attr('cx', bondPos)
          .attr('cy', SULFIDE_POS)
          .attr('r', CIRCLE_RADIUS)
          .style('stroke', 'white')
          .style('fill', COLOR_PALLETE[idx % COLOR_PALLETE.length]);

        // attach stem
        const bond = g.append('line');
        bond
          .attr('x1', bondPos)
          .attr('y1', SULFIDE_POS + 20)
          .attr('x2', bondPos)
          .attr('y2', bondHeight([x, y]))
          .style('stroke', 'black');

        const sulfide = g.append('text');
        sulfide
          .attr('dx', bondPos - 5)
          .attr('dy', bondHeight([x, y]) + SULFIDE_ATOM_OFFSET)
          .text(() => 'C')
          .attr('class', 'sulfide-labels');

        const pos = g.append('text');
        pos
          .attr('dx', bondPos + 6)
          .attr('dy', bondHeight([x, y]) + SULFIDE_ATOM_OFFSET + 5)
          .text(() => `${y}`)
          .attr('class', 'sulfide-labels--pos');

        const link = g.append('line');
        link
          .attr('x1', WINDOW_SPINE_START_POS)
          .attr('y1', bondHeight([x, y]))
          .attr('x2', bondPos)
          .attr('y2', bondHeight([x, y]))
          .style('stroke', 'black');
      });

      const rightBonds = disulfideBonds.filter((b) => {
        const [x, y] = b.split(' ');
        const b1 = parseInt(x, 10);
        const b2 = parseInt(y, 10);
        return b1 > windowStart && b1 <= windowEnd && b2 > windowEnd;
      });

      rightBonds.forEach((pair, idx) => {
        const [x, y] = pair.split(' ');
        // attach sulfide
        let bondProportion = x / proteinLength;
        let windowProportion =
          (x - windowPos.start) / (windowPos.end - windowPos.start);
        let bondPos = isWindowView
          ? WINDOW_SPINE_START_POS + windowProportion * WINDOW_SPINE_WIDTH
          : SPINE_START_POS + bondProportion * SPINE_WIDTH;
        let scaledWindowEnd = WINDOW_SPINE_WIDTH + 15;

        const atom = g.append('circle');
        atom
          .attr('cx', bondPos)
          .attr('cy', SULFIDE_POS)
          .attr('r', CIRCLE_RADIUS)
          .style('stroke', 'white')
          .style('fill', COLOR_PALLETE[idx % COLOR_PALLETE.length]);

        // attach stem
        const bond = g.append('line');
        bond
          .attr('x1', bondPos)
          .attr('y1', SULFIDE_POS + 20)
          .attr('x2', bondPos)
          .attr('y2', bondHeight([x, y]))
          .style('stroke', 'black');

        const sulfide = g.append('text');
        sulfide
          .attr('dx', bondPos - 5)
          .attr('dy', bondHeight([x, y]) + SULFIDE_ATOM_OFFSET)
          .text(() => 'C')
          .attr('class', 'sulfide-labels');

        const pos = g.append('text');
        pos
          .attr('dx', bondPos + 7)
          .attr('dy', bondHeight([x, y]) + SULFIDE_ATOM_OFFSET + 5)
          .text(() => `${x}`)
          .attr('class', 'sulfide-labels--pos');

        const link = g.append('line');
        link
          .attr('x1', bondPos)
          .attr('y1', bondHeight([x, y]))
          .attr('x2', scaledWindowEnd)
          .attr('y2', bondHeight([x, y]))
          .style('stroke', 'black');
      });
    }

    bonds.forEach((pair, idx) => {
      const [x, y] = pair;
      let xProportion = x / proteinLength;
      let xWindowProp =
        (x - windowPos.start) / (windowPos.end - windowPos.start);
      let xPos = isWindowView
        ? WINDOW_SPINE_START_POS + xWindowProp * WINDOW_SPINE_WIDTH
        : SPINE_START_POS + xProportion * SPINE_WIDTH;

      let yProportion = y / proteinLength;
      let yWindowProp =
        (y - windowPos.start) / (windowPos.end - windowPos.start);
      let yPos = isWindowView
        ? WINDOW_SPINE_START_POS + yWindowProp * WINDOW_SPINE_WIDTH
        : SPINE_START_POS + yProportion * SPINE_WIDTH;

      pair.forEach((el) => {
        const atom = g.append('circle');
        atom
          .attr('cx', xPos)
          .attr('cy', SULFIDE_POS)
          .attr('r', CIRCLE_RADIUS)
          .style('stroke', 'white')
          .style('fill', COLOR_PALLETE[idx % COLOR_PALLETE.length]);

        const atom2 = g.append('circle');
        atom2
          .attr('cx', yPos)
          .attr('cy', SULFIDE_POS)
          .attr('r', CIRCLE_RADIUS)
          .style('stroke', 'white')
          .style('fill', COLOR_PALLETE[idx % COLOR_PALLETE.length]);

        const bond = g.append('line');
        bond
          .attr('x1', xPos)
          .attr('y1', SULFIDE_POS + 20)
          .attr('x2', xPos)
          .attr('y2', bondHeight(pair))
          .style('stroke', 'black');

        const bond2 = g.append('line');
        bond2
          .attr('x1', yPos)
          .attr('y1', SULFIDE_POS + 20)
          .attr('x2', yPos)
          .attr('y2', bondHeight(pair))
          .style('stroke', 'black');

        const sulfide = g.append('text');
        sulfide
          .attr('dx', xPos - 5)
          .attr('dy', bondHeight(pair) + SULFIDE_ATOM_OFFSET)
          .text(() => 'C')
          .attr('class', 'sulfide-labels');

        const sulfide2 = g.append('text');
        sulfide2
          .attr('dx', yPos - 5)
          .attr('dy', bondHeight(pair) + SULFIDE_ATOM_OFFSET)
          .text(() => 'C')
          .attr('class', 'sulfide-labels');

        const pos = g.append('text');
        pos
          .attr('dx', xPos + 4)
          .attr('dy', bondHeight(pair) + SULFIDE_ATOM_OFFSET + 5)
          .text(() => `${x}`)
          .attr('class', 'sulfide-labels--pos');

        const pos2 = g.append('text');
        pos2
          .attr('dx', yPos + 4)
          .attr('dy', bondHeight(pair) + SULFIDE_ATOM_OFFSET + 5)
          .text(() => `${y}`)
          .attr('class', 'sulfide-labels--pos');
      });
      const link = g.append('line');
      link
        .attr('x1', xPos)
        .attr('y1', bondHeight(pair))
        .attr('x2', yPos)
        .attr('y2', bondHeight(pair))
        .style('stroke', 'black');
    });
  };

  const attachOutsideDomain = (g, isWindowView) => {
    let start_position = outsideDomain.map((obj) => obj.start_pos);
    let end_position = outsideDomain.map((obj) => obj.end_pos);

    console.log('Visualization -> attach Outside Domain');

    for (let i = 0; i < start_position.length; i++) {
      const rectBase = g.append('rect');

      let startProportion = start_position[i] / proteinLength;
      let startPos = isWindowView
        ? WINDOW_SPINE_START_POS + startProportion * WINDOW_SPINE_WIDTH
        : SPINE_START_POS + startProportion * SPINE_WIDTH;

      if (!isWindowView) {
        let widthProportion =
          (end_position[i] - start_position[i]) / proteinLength;
        let rectWidth = fullScale
          ? end_position[i] - start_position[i]
          : widthProportion * SPINE_WIDTH;
        // console.log("non-window outside domain rect:", rectWidth)
        // console.log('non window widthProportion:', widthProportion)
        rectBase
          .attr('width', rectWidth)
          .attr('height', SPINE_HEIGHT)
          .attr('x', startPos)
          .attr('y', innerHeight / 2)
          .style('fill', '#7B82EE');
      } else {
        if (startPos >= windowStart || startPos <= windowEnd) {
          let newLength = windowEnd - windowStart;
          let startProportion = (start_position[i] - windowStart) / newLength;
          let widthProportion = 0;

          //scaling calculations to adjust coloring outside the spine
          if (parseInt(end_position[i]) > parseInt(windowEnd)) {
            if (startProportion < 0) {
              startProportion = 0;
              widthProportion = (windowEnd - windowStart) / newLength;
            } else {
              widthProportion = (windowEnd - start_position[i]) / newLength;
              // console.log(startProportion, end_position[i], windowEnd)
            }
          } else {
            if (startProportion < 0) {
              startProportion = 0;
              widthProportion = (end_position[i] - windowStart) / newLength;
            } else {
              widthProportion =
                (end_position[i] - start_position[i]) / newLength;
            }
          }

          let rectWidth = widthProportion * WINDOW_SPINE_WIDTH;
          startPos =
            WINDOW_SPINE_START_POS + startProportion * WINDOW_SPINE_WIDTH;
          // console.log("protein window outside domain rect:", rectWidth)
          // console.log('protein window widthProportion:', widthProportion)
          rectBase
            .attr('width', rectWidth)
            .attr('height', SPINE_HEIGHT)
            .attr('x', startPos)
            .attr('y', innerHeight / 2)
            .style('fill', '#7B82EE'); //#3f51b5
        }
      }
    }
  };

  const attachInsideDomain = (g, isWindowView) => {
    let start_position = insideDomain.map((obj) => obj.start_pos);
    let end_position = insideDomain.map((obj) => obj.end_pos);

    console.log('Visualization -> attach Inside Domain');

    for (let i = 0; i < start_position.length; i++) {
      const rectBase = g.append('rect');

      let startProportion = start_position[i] / proteinLength;
      let startPos = isWindowView
        ? WINDOW_SPINE_START_POS + startProportion * WINDOW_SPINE_WIDTH
        : SPINE_START_POS + startProportion * SPINE_WIDTH;

      if (!isWindowView) {
        //regular view with adjustments for the scaling factor
        let widthProportion =
          (end_position[i] - start_position[i]) / proteinLength;
        let rectWidth = fullScale
          ? end_position[i] - start_position[i]
          : widthProportion * SPINE_WIDTH;

        rectBase
          .attr('width', rectWidth)
          .attr('height', SPINE_HEIGHT)
          .attr('x', startPos)
          .attr('y', innerHeight / 2)
          .style('fill', '#FF6088');
      } else {
        //windowView with adjustments based on protein position
        if (startPos >= windowStart || startPos <= windowEnd) {
          let newLength = windowEnd - windowStart;
          let startProportion = (start_position[i] - windowStart) / newLength;
          let widthProportion = 0;

          //scaling calculations to adjust coloring outside the spine
          if (parseInt(end_position[i]) > parseInt(windowEnd)) {
            if (startProportion < 0) {
              startProportion = 0;
              widthProportion = (windowEnd - windowStart) / newLength;
            } else {
              widthProportion = (windowEnd - start_position[i]) / newLength;
            }
          } else {
            if (startProportion < 0) {
              startProportion = 0;
              widthProportion = (end_position[i] - windowStart) / newLength;
            } else {
              widthProportion =
                (end_position[i] - start_position[i]) / newLength;
            }
          }

          let rectWidth = widthProportion * WINDOW_SPINE_WIDTH;
          startPos =
            WINDOW_SPINE_START_POS + startProportion * WINDOW_SPINE_WIDTH;
          // console.log("inside domain rect:", rectWidth)
          rectBase
            .attr('width', rectWidth)
            .attr('height', SPINE_HEIGHT)
            .attr('x', startPos)
            .attr('y', innerHeight / 2)
            .style('fill', '#FF6088'); //#f50057
        }
      }
    }
  };

  const attachSequons = (g, isWindowView) => {
    console.log('Visualization -> attach Free Sequons');
    let seq = sequons.map((el) => parseInt(el, 10));
    if (isWindowView) {
      seq = seq.filter((pos) => pos >= windowStart && pos <= windowEnd);
    }
    // const scale = isWindowView ? windowScale : xScale;
    seq.forEach((el) => {
      let seqProportion = el / proteinLength;
      let windowProportion =
        (el - windowPos.start) / (windowPos.end - windowPos.start);
      let seqPos = isWindowView
        ? WINDOW_SPINE_START_POS + windowProportion * WINDOW_SPINE_WIDTH
        : SPINE_START_POS + seqProportion * SPINE_WIDTH;

      const bond = g.append('line');
      bond
        .attr('x1', seqPos)
        .attr('y1', SULFIDE_POS - 20)
        .attr('x2', seqPos)
        .attr('y2', SULFIDE_POS - 50)
        .style('stroke', 'black');

      const label = g.append('text');
      label
        .attr('dx', seqPos - 4)
        .attr('dy', SULFIDE_POS - 60)
        .text(() => 'N')
        .attr('class', 'sulfide-labels');

      const pos = g.append('text');
      pos
        .attr('dx', seqPos + 8)
        .attr('dy', SULFIDE_POS - 55)
        .text(() => `${el}`)
        .attr('class', 'sulfide-labels--pos');

      const atom = g.append('circle');
      atom
        .attr('cx', seqPos)
        .attr('cy', SULFIDE_POS)
        .attr('r', CIRCLE_RADIUS - 2)
        .style('stroke', 'white')
        .style('fill', 'black');
      //COLOR_PALLETE[idx % COLOR_PALLETE.length]
    });
  };

  // #RD START
  // Draws one side's (above/below) already-computed label layout. This function
  // itself has no notion of "by-type" vs "collision-aware" - it just draws every
  // entry's connector/letter/position-number at the y buildAminoAcidLabelLayout()
  // gave it. For the full-length view that y is entirely determined by the
  // label's amino-acid TYPE (layoutAminoAcidLabelsByType: one fixed, compact
  // lane per selected amino acid, so EVERY occurrence of the same type shares
  // the exact same height while different types get different, tightly-spaced
  // ones - no per-residue variation, even when a type's residues cluster
  // densely); for the zoomed window view y varies per individual residue
  // occurrence regardless of type (layoutAminoAcidLabels' collision-aware
  // packing), since that's where exact/readable positions matter. Every label
  // is always rendered - the layout only changes WHERE a label sits, never
  // WHETHER it's drawn.
  //
  // direction is 'above' or 'below', matching whichever array
  // buildAminoAcidLabelLayout() put a given amino acid's positions into (based on
  // its AMINO_ACID_RENDER_STYLE 'solid'/'white' setting) - each solid-style letter
  // renders above the spine and each hollow-style letter below it, decoupled from
  // the drawing math.
  const attachAminoAcidLabels = (g, layout, direction) => {
    layout.forEach(({ x, y, color, aminoAcid, position, textDistance }) => {
      const bond = g.append('line');
      const label = g.append('text');
      const pos = g.append('text');
      const atom = g.append('circle');

      if (direction === 'above') {
        bond
          .attr('x1', x)
          .attr('y1', SULFIDE_POS - 20)
          .attr('x2', x)
          .attr('y2', SULFIDE_POS - y)
          .style('stroke', color || 'black');

        // Letter and position number are always drawn together (never
        // conditional) and always at the SAME x as their connector line.
        label
          .attr('dx', x - 4)
          .attr('dy', SULFIDE_POS - (y + 10))
          .text(() => aminoAcid)
          .attr('class', 'amino-acid-label')
          .style('fill', color || 'black');

        pos
          .attr('dx', x + 4 + textDistance)
          .attr('dy', SULFIDE_POS - (y + 5))
          .text(() => position)
          .attr('class', 'amino-acid-label--pos')
          .style('fill', color || 'black');

        atom
          .attr('cx', x)
          .attr('cy', SULFIDE_POS)
          .attr('r', CIRCLE_RADIUS - 2)
          .style('stroke', 'white')
          .style('fill', color || 'black');
      } else {
        bond
          .attr('x1', x)
          .attr('y1', SULFIDE_POS + 20)
          .attr('x2', x)
          .attr('y2', SULFIDE_POS + y)
          .style('stroke', color || 'black');

        label
          .attr('dx', x - 4)
          .attr('dy', SULFIDE_POS + (y + 10))
          .text(() => aminoAcid)
          .attr('class', 'amino-acid-label')
          .style('fill', color || 'black');

        pos
          .attr('dx', x + 6 + textDistance)
          .attr('dy', SULFIDE_POS + (y + 15))
          .text(() => position)
          .attr('class', 'amino-acid-label--pos')
          .style('fill', color || 'black');

        atom
          .attr('cx', x)
          .attr('cy', SULFIDE_POS)
          .attr('r', CIRCLE_RADIUS - 2)
          .style('stroke', color || 'black')
          .style('fill', 'white');
      }
    });
  };
  // #RD END

  const attachCysteines = (g, isWindowView) => {
    console.log('Visualization -> attach Free Sequons');
    let cys = cysteines.map((el) => parseInt(el, 10));
    if (isWindowView) {
      cys = cys.filter((pos) => pos >= windowStart && pos <= windowEnd);
    }

    // const scale = isWindowView ? windowScale : xScale;
    cys.forEach((el) => {
      let cysProportion = el / proteinLength;
      let windowProportion =
        (el - windowPos.start) / (windowPos.end - windowPos.start);
      let cysPos = isWindowView
        ? WINDOW_SPINE_START_POS + windowProportion * WINDOW_SPINE_WIDTH
        : SPINE_START_POS + cysProportion * SPINE_WIDTH;

      const bond = g.append('line');
      bond
        .attr('x1', cysPos)
        .attr('y1', SULFIDE_POS + 20)
        .attr('x2', cysPos)
        .attr('y2', SULFIDE_POS + 50)
        .style('stroke', 'black');

      const label = g.append('text');
      label
        .attr('dx', cysPos - 4)
        .attr('dy', SULFIDE_POS + 60)
        .text(() => 'C')
        .attr('class', 'sulfide-labels');

      const pos = g.append('text');
      pos
        .attr('dx', cysPos + 6)
        .attr('dy', SULFIDE_POS + 65)
        .text(() => `${el}`)
        .attr('class', 'sulfide-labels--pos');

      const atom = g.append('circle');
      atom
        .attr('cx', cysPos)
        .attr('cy', SULFIDE_POS)
        .attr('r', CIRCLE_RADIUS - 2)
        .style('stroke', 'black')
        .style('fill', 'white');
      //COLOR_PALLETE[idx % COLOR_PALLETE.length]
    });
  };

  const attachSpine = (g, isWindowView) => {
    const spineBase = g.append('rect');
    let spineWidth = fullScale ? proteinLength : SPINE_WIDTH;
    const startPos = isWindowView ? WINDOW_SPINE_START_POS : SPINE_START_POS;
    if (isWindowView) {
      spineWidth = WINDOW_SPINE_WIDTH;
    }

    spineBase
      .attr('width', spineWidth)
      .attr('height', SPINE_HEIGHT)
      .attr('x', startPos)
      .attr('y', innerHeight / 2)
      .style('fill', 'white')
      .style('stroke', 'black');
  };

  const attachNTerminus = (g) => {
    const NTerm = g.append('text');
    NTerm.attr('dx', SPINE_START_POS - 55)
      .attr('dy', innerHeight / 2 + 20)
      .text(() => 'NH2 --')
      .style('font-weight', 'bold');
  };

  const attachCTerminus = (g) => {
    const CTerm = g.append('text');
    CTerm.attr('dx', SPINE_START_POS + SPINE_WIDTH + 5)
      .attr('dy', innerHeight / 2 + 20)
      .text(() => '-- COOH')
      .style('font-weight', 'bold');
  };

  const renderVisualization = (id, isWindowView) => {
    const svg = select(id);
    svg.style('background-color', 'white');

    const translateX = isWindowView
      ? initialWidth / 15
      : EFFECTIVE_LEFT_RESERVED_WIDTH;
    // #RD OLD CODE
    // const translateY = isWindowView ? initialWidth / 15 : margin.top;
    // #RD END OLD CODE
    // #RD START
    // Shift the whole drawing group down by extraTop when the current amino-acid
    // label selection needs more room above the spine than the default margin
    // provides, so dense selections get real reserved layout space (not just
    // overflow:visible bleed) instead of a fixed height that assumes few lanes.
    const { extraTop } = isWindowView ? windowExtraSpace : fullExtraSpace;
    const translateY = (isWindowView ? initialWidth / 15 : margin.top) + extraTop;
    // #RD END

    const g = svg.append('g');
    g.attr('transform', `translate(${translateX}, ${translateY})`);
    attachSpine(g, isWindowView);
    if (showOutsideDomain) {
      attachOutsideDomain(g, isWindowView);
    }
    if (showInsideDomain) {
      attachInsideDomain(g, isWindowView);
    }
    if (showSequons) {
      attachSequons(g, isWindowView);
    }
    if (showCysteines) {
      attachCysteines(g, isWindowView);
    }
    if (showDisulfide) {
      attachSulfides(g, isWindowView);
    }
    if (showGlyco) {
      attachGlycoBonds(g, isWindowView);
    }
    if (showOGalNAc) {
      attachOGalNAcBonds(g, isWindowView);
    }
    if (showOGlc) {
      attachOGlcBonds(g, isWindowView);
    }
    if (showGlycation) {
      attachGlycationBonds(g, isWindowView);
    }
    // #RD OLD CODE
    // if (showFreeS) {
    //   attachFreeAmAcids(g, isWindowView, freeS, 'S', 'solid');
    // }
    // if (showFreeT) {
    //   attachFreeAmAcids(g, isWindowView, freeT, 'T', 'solid');
    // }
    // if (showFreeK) {
    //   attachFreeAmAcids(g, isWindowView, freeK, 'K', 'white');
    // }
    // if (showFreeW) {
    //   attachFreeAmAcids(g, isWindowView, freeW, 'W', 'white', 5);
    // }
    // #RD END OLD CODE
    // #RD OLD CODE (superseded - see below)
    // selectedAminoAcids.forEach((aminoAcid, aminoAcidLane) => {
    //   const style =
    //     AMINO_ACID_RENDER_STYLE[aminoAcid] || DEFAULT_AMINO_ACID_RENDER_STYLE;
    //   const freePositions = aminoAcids[aminoAcid]
    //     ? aminoAcids[aminoAcid].free
    //     : [];
    //   const aminoAcidColor =
    //     SELECTED_AMINO_ACID_COLORS[
    //       aminoAcidLane % SELECTED_AMINO_ACID_COLORS.length
    //     ];
    //   attachFreeAmAcids(
    //     g,
    //     isWindowView,
    //     freePositions,
    //     aminoAcid,
    //     style.visualize,
    //     style.textDistance,
    //     aminoAcidLane,
    //     aminoAcidColor
    //   );
    // });
    // #RD END OLD CODE
    // #RD START
    // Each selected amino acid's positions were already merged into one shared
    // layout per side by buildAminoAcidLabelLayout() (called once per render,
    // above) - draw straight from that instead of laying labels out one selected
    // letter at a time.
    const aminoAcidLayout = isWindowView
      ? windowAminoAcidLayout
      : fullAminoAcidLayout;
    attachAminoAcidLabels(g, aminoAcidLayout.aboveLayout, 'above');
    attachAminoAcidLabels(g, aminoAcidLayout.belowLayout, 'below');
    // #RD END
    if (showPhosphoserine) {
      attachPhosphorylation(g, isWindowView, phosphoserine, '#FDCC04');
    }
    if (showPhosphotyrosine) {
      attachPhosphorylation(g, isWindowView, phosphotyrosine, '#627DCC');
    }
    if (showPhosphothreonine) {
      attachPhosphorylation(g, isWindowView, phosphothreonine, '#93E37F');
    }
    if (!isWindowView) {
      attachNTerminus(g);
      attachCTerminus(g);
    }
  };

  const removeElements = () => {
    const svgEls = ['text', 'line', 'circle', 'rect'];
    svgEls.forEach((el) => {
      const allNodes = selectAll(el);
      allNodes.remove();
    });
  };

  useEffect(() => {
    removeElements();
    renderVisualization('#svg');
    renderVisualization('#windowSvg', true);
    if (scaleFactor !== 1) {
      document.getElementById('svg').style.marginLeft =
        (scaleFactor - 1) * window.innerWidth;
      // document.getElementById('svg').scrollIntoView({behavior: "auto", inline: "center"});
    } else if (fullScale) {
      document.getElementById('svg').style.marginLeft = 0;
      // 0.95 * proteinLength + 2 * margin.left;
    } else {
      document.getElementById('svg').style.marginLeft = 0;
    }
  }, [
    svgRef.current,
    showDisulfide,
    showGlyco,
    showSequons,
    showCysteines,
    showOutsideDomain,
    showInsideDomain,
    // #RD OLD CODE
    // showFreeS,
    // showFreeT,
    // showFreeK,
    // showFreeW,
    // #RD END OLD CODE
    // #RD START
    selectedAminoAcids,
    // #RD END
    scaleVisualization,
    scaleFactor,
    fullScale,
    windowStart,
    windowEnd
  ]);

  // #RD START
  // Horizontal-scale slider (scaleVisualization) and Full Scale mode both
  // intentionally render the protein wider than the viewport with flush-left,
  // horizontally-scrollable positioning (see the marginLeft logic below and the
  // useEffect that sets #svg's own scroll margin) - centering would risk
  // scrolling the NH2 terminus off-screen in those modes, so the centered
  // wrapper is only used for the default (unscaled, non-Full-Scale) view.
  const svgWrapperClassName =
    scaleVisualization || fullScale ? 'svg-wrapper' : 'svg-wrapper--centered';
  // #RD END

  const svg = Number.isInteger(currSelection) ? (
    <div className={svgWrapperClassName}>
      <svg
        style={
          fullScale ? {} : { marginLeft: (scaleFactor - 1) * window.innerWidth }
        }
        // #RD OLD CODE
        // height={`${height}`}
        // #RD END OLD CODE
        // #RD START
        // Grows past the default height when the current amino-acid label
        // selection needs more lanes than the default margins provide room for,
        // instead of assuming a fixed height sized for only a few lanes.
        height={`${height + fullExtraSpace.extraTop + fullExtraSpace.extraBottom}`}
        // #RD END
        width={`${
          fullScale
            ? proteinLength + margin.left * 2
            : window.innerWidth * scaleFactor
        }`}
        ref={svgRef}
        id="svg"
        overflow="visible"
      >
        <rect />
      </svg>
    </div>
  ) : null;

  const windowSvg = Number.isInteger(currSelection) ? (
    <div className="windowSvg--wrapper">
      <svg
        // #RD OLD CODE
        // height={`${height}`}
        // #RD END OLD CODE
        // #RD START
        height={`${
          height + windowExtraSpace.extraTop + windowExtraSpace.extraBottom
        }`}
        // #RD END
        width={`${initialWidth}`}
        ref={windowSvgRef}
        id="windowSvg"
        overflow="visible"
      >
        <rect />
      </svg>
    </div>
  ) : null;

  return (
    <div>
      {isLegendOpen ? (
        <Legend
          glycoslation={glycoslation}
          o_glcnac={o_glcnac}
          o_glc={o_glc}
          glycation={glycation}
          disulfideBonds={disulfideBonds}
          sequons={sequons}
          cysteines={cysteines}
          // #RD OLD CODE
          // free_s={freeS}
          // free_t={freeT}
          // free_k={freeK}
          // free_w={freeW}
          // #RD END OLD CODE
          // #RD START
          aminoAcids={aminoAcids}
          selectedAminoAcids={selectedAminoAcids}
          toggleAminoAcid={toggleAminoAcidSelection}
          // #RD END
          phosphoserine={phosphoserine}
          phosphothreonine={phosphothreonine}
          phosphotyrosine={phosphotyrosine}
          toggleGlyco={setShowGlyco}
          toggleSulfide={setShowDisulfide}
          toggleOutside={setShowOutisde}
          toggleInside={setShowInside}
          toggleSequons={setShowSequons}
          toggleCysteines={setShowCysteines}
          // #RD OLD CODE
          // toggleFreeS={setShowFreeS}
          // toggleFreeT={setShowFreeT}
          // toggleFreeK={setShowFreeK}
          // toggleFreeW={setShowFreeW}
          // #RD END OLD CODE
          length={proteinLength}
          species={species}
        />
      ) : null}
      {svg}
      {/* #RD START */}
      {/* Normal document flow, not the old position:relative top:-100px /
          top:100px pair (see the removed rules in Visualization/index.scss
          and ProteinWindow/index.scss) that used to pull the input panel down
          and the window SVG up so they'd meet - that hack was tuned for a
          much taller window SVG; once the SVG's height shrank (see
          VISUALIZATION_HEIGHT_CAP in App.jsx), the same fixed 200px pull
          started overlapping the input panel on top of the window view's own
          labels. .window-section's own margin/gap now provide the spacing
          instead, sized to the actual rendered content rather than a fixed
          offset tuned for a since-changed height. */}
      <div className="window-section">
        <ProteinWindow
          length={proteinLength}
          updateWindowStart={updateWindowStart}
          updateWindowEnd={updateWindowEnd}
        />
        {windowSvg}
      </div>
      {/* #RD END */}
    </div>
  );
}

Visualization.propTypes = {
  isLegendOpen: PropTypes.bool,
  initialOptions: PropTypes.arrayOf(PropTypes.object).isRequired,
  height: PropTypes.number,
  width: PropTypes.number,
  currSelection: PropTypes.number.isRequired,
  scaleFactor: PropTypes.number,
  fullScale: PropTypes.bool,
  setFullScaleDisabled: PropTypes.func
};

Visualization.defaultProps = {
  isLegendOpen: false,
  setFullScaleDisabled: () => {},
  scaleFactor: 1,
  fullScale: false,
  height: 500,
  width: 500
};

export default Visualization;
