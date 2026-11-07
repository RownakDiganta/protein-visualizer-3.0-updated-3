// src/components/Visualization/index.js
// Core D3 rendering engine: draws the full protein "spine" SVG (domains, disulfide
// bonds, glycosylation, phosphosites, free residues) plus the zoomable window view.
import React, { useRef, useEffect, useState } from 'react';
import { select, scaleLinear, selectAll } from 'd3';
import PropTypes from 'prop-types';
import constants from '../../static/constants';
import Legend from '../Legend';
import ProteinWindow from './ProteinWindow';
import {
  AMINO_LABEL_MAX_VISIBLE_LANES,
  AMINO_ACID_BASE_CONNECTOR_LENGTH,
  AMINO_ACID_LANE_GAP,
  AMINO_LABEL_SAFETY_BUFFER,
  buildTypeBandMap,
  layoutAminoAcidLabelsByType,
  computeRequiredLabelSpace
} from './labelPlacement';

import './index.scss';

const CIRCLE_RADIUS = 5;
const SPINE_HEIGHT = 30;
const RESIDUE_MARKER_STROKE = 'rgba(0, 0, 0, 0.35)';
const RESIDUE_MARKER_STROKE_WIDTH = 1;

const { COLOR_PALLETE } = constants;
const {
  AMINO_ACIDS,
  AMINO_ACID_RENDER_STYLE,
  DEFAULT_AMINO_ACID_RENDER_STYLE,
  MAX_SELECTED_AMINO_ACIDS,
  SELECTED_AMINO_ACID_COLORS
} = constants;

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
    aminoAcids = {},
    species
  } = initialOptions[currSelection];

  console.log('Visualization -> proteinLength', proteinLength);

  const svgRef = useRef(null);
  const windowSvgRef = useRef(null);
  const svgWrapperRef = useRef(null);
  const vizRootRef = useRef(null);
  const [windowPos, setWindowPos] = useState({ start: 0, end: proteinLength });
  const { start: windowStart, end: windowEnd } = windowPos;
  const [windowView, setWindowView] = useState(false);
  const [showGlyco, setShowGlyco] = useState(true);
  const [showDisulfide, setShowDisulfide] = useState(true);
  const [showOutsideDomain, setShowOutisde] = useState(true);
  const [showInsideDomain, setShowInside] = useState(true);
  const [showSequons, setShowSequons] = useState(false);
  const [showCysteines, setShowCysteines] = useState(false);
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

  const showOGalNAc = selectedAminoAcids.includes('o_glcnac');
  const showOGlc = selectedAminoAcids.includes('o_glc');
  const showGlycation = selectedAminoAcids.includes('glycation');
  const showPhosphoserine = selectedAminoAcids.includes('phosphoserine');
  const showPhosphothreonine = selectedAminoAcids.includes('phosphothreonine');
  const showPhosphotyrosine = selectedAminoAcids.includes('phosphotyrosine');

  const scaleVisualization = scaleFactor !== 1;
  const scaledWidth = initialWidth * scaleFactor;

  const margin = {
    top: height / 15,
    right: initialWidth / 15,
    bottom: height / 15,
    left: initialWidth / 10
  };
  const DIAGRAM_VERTICAL_RATIO = 0.18;
  const VERTICAL_RATIO_REFERENCE_HEIGHT = 700;
  const CAPPED_DIAGRAM_LOCAL_OFFSET =
    DIAGRAM_VERTICAL_RATIO * VERTICAL_RATIO_REFERENCE_HEIGHT;
  const innerHeight =
    2 *
    Math.min(DIAGRAM_VERTICAL_RATIO * height, CAPPED_DIAGRAM_LOCAL_OFFSET);
  const SULFIDE_POS = innerHeight / 2 + SPINE_HEIGHT / 2;
  const SULFIDE_BOND_LENGTH = 40;
  const SULFIDE_ATOM_OFFSET = 20;
  const GLYCO_STEM_LENGTH = 60;
  const GLYCO_LINK_LENGTH = 10;
  const SPINE_START_POS = 30;
  // Clear space between each terminus label and the end of the backbone bar.
  // Shared by both terminus labels so the two ends stay symmetric.
  const TERMINUS_LABEL_GAP = 5;

  const PROTEIN_WINDOW_CARD_CLEARANCE = -148;

  const DIAGRAM_HORIZONTAL_MARGIN_LEFT = Math.min(margin.left, 146);
  const DIAGRAM_HORIZONTAL_MARGIN_RIGHT = Math.min(margin.left, 146);

  const DIAGRAM_HORIZONTAL_MARGIN_LEFT_MIN = 116;
  const DIAGRAM_HORIZONTAL_MARGIN_RIGHT_MIN = 116;
  const MIN_SPINE_WIDTH = 30;
  const idealAvailableWidth =
    scaledWidth -
    scaleFactor *
      (DIAGRAM_HORIZONTAL_MARGIN_LEFT + DIAGRAM_HORIZONTAL_MARGIN_RIGHT);
  const isReservationTight = idealAvailableWidth < MIN_SPINE_WIDTH;
  const EFFECTIVE_HORIZONTAL_MARGIN_LEFT = isReservationTight
    ? DIAGRAM_HORIZONTAL_MARGIN_LEFT_MIN
    : DIAGRAM_HORIZONTAL_MARGIN_LEFT;
  const EFFECTIVE_HORIZONTAL_MARGIN_RIGHT = isReservationTight
    ? DIAGRAM_HORIZONTAL_MARGIN_RIGHT_MIN
    : DIAGRAM_HORIZONTAL_MARGIN_RIGHT;

  const SPINE_WIDTH = Math.max(
    MIN_SPINE_WIDTH,
    scaledWidth -
      scaleFactor *
        (EFFECTIVE_HORIZONTAL_MARGIN_LEFT + EFFECTIVE_HORIZONTAL_MARGIN_RIGHT)
  );

  const WINDOW_SPINE_START_POS = SPINE_START_POS;
  const WINDOW_SPINE_WIDTH = Math.max(
    MIN_SPINE_WIDTH,
    initialWidth -
      (EFFECTIVE_HORIZONTAL_MARGIN_LEFT + EFFECTIVE_HORIZONTAL_MARGIN_RIGHT)
  );

  const isAboveStyleType = (key) => {
    if (!AMINO_ACIDS.includes(key)) {
      return true; // every modification draws above the spine
    }
    const style = AMINO_ACID_RENDER_STYLE[key] || DEFAULT_AMINO_ACID_RENDER_STYLE;
    return style.visualize === 'solid';
  };
  const aboveBandMap = buildTypeBandMap(
    selectedAminoAcids.filter(isAboveStyleType)
  );
  const belowBandMap = buildTypeBandMap(
    selectedAminoAcids.filter((key) => !isAboveStyleType(key))
  );
  const MIN_SEARCHBAR_GAP = 40;
  const AMINO_LABEL_FONT_ASCENT_ESTIMATE = 14;
  const TARGET_SEARCHBAR_CLEARANCE = MIN_SEARCHBAR_GAP + 3;
  const AMINO_LABEL_COMPRESSION_FLOOR = 0.5;
  const numAboveBands = aboveBandMap.size;
  const uncompressedTopmostReach =
    AMINO_ACID_BASE_CONNECTOR_LENGTH +
    Math.max(0, numAboveBands - 1) * AMINO_ACID_LANE_GAP;
  const targetTopmostReach =
    numAboveBands === 0
      ? 0
      : SULFIDE_POS +
        5 -
        AMINO_LABEL_FONT_ASCENT_ESTIMATE -
        TARGET_SEARCHBAR_CLEARANCE;
  const aboveCompressionScale =
    numAboveBands === 0
      ? 1
      : Math.max(
          AMINO_LABEL_COMPRESSION_FLOOR,
          targetTopmostReach / uncompressedTopmostReach
        );
  const EFFECTIVE_ABOVE_BASE_CONNECTOR_LENGTH =
    AMINO_ACID_BASE_CONNECTOR_LENGTH * aboveCompressionScale;
  const EFFECTIVE_ABOVE_LANE_GAP = AMINO_ACID_LANE_GAP * aboveCompressionScale;

  if (numAboveBands > 0 && aboveCompressionScale === AMINO_LABEL_COMPRESSION_FLOOR) {
    const topmostReachAtFloor =
      AMINO_LABEL_COMPRESSION_FLOOR * uncompressedTopmostReach;
    const actualGapAtFloor =
      SULFIDE_POS +
      5 -
      AMINO_LABEL_FONT_ASCENT_ESTIMATE -
      topmostReachAtFloor;
    if (actualGapAtFloor < MIN_SEARCHBAR_GAP) {
      console.warn(
        `Visualization -> even the minimum label spacing (${Math.round(
          AMINO_LABEL_COMPRESSION_FLOOR * 100
        )}% of normal) leaves only ~${Math.round(
          actualGapAtFloor
        )}px of clearance above the search bar (need ${MIN_SEARCHBAR_GAP}px) - the diagram's reserved space will grow slightly so labels don't visually overlap the search bar.`
      );
    }
  }

  const bandReach = (lane) =>
    EFFECTIVE_ABOVE_BASE_CONNECTOR_LENGTH + lane * EFFECTIVE_ABOVE_LANE_GAP;

  const buildAminoAcidLabelLayout = (isWindowView) => {
    const aboveLabels = [];
    const belowLabels = [];

    const selectedAminoAcidLetters = selectedAminoAcids.filter((key) =>
      AMINO_ACIDS.includes(key)
    );

    selectedAminoAcidLetters.forEach((aminoAcid, aminoAcidColorIndex) => {
      const style =
        AMINO_ACID_RENDER_STYLE[aminoAcid] || DEFAULT_AMINO_ACID_RENDER_STYLE;
      const color =
        SELECTED_AMINO_ACID_COLORS[
          aminoAcidColorIndex % SELECTED_AMINO_ACID_COLORS.length
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

    const aboveLayoutConfig = {
      baseConnectorLength: EFFECTIVE_ABOVE_BASE_CONNECTOR_LENGTH,
      laneGap: EFFECTIVE_ABOVE_LANE_GAP
    };
    const belowLayoutConfig = {
      baseConnectorLength: AMINO_ACID_BASE_CONNECTOR_LENGTH,
      laneGap: AMINO_ACID_LANE_GAP
    };
    const aboveLayout = layoutAminoAcidLabelsByType({
      labels: aboveLabels,
      side: 'above',
      bandMap: aboveBandMap,
      ...aboveLayoutConfig
    });
    const belowLayout = layoutAminoAcidLabelsByType({
      labels: belowLabels,
      side: 'below',
      bandMap: belowBandMap,
      ...belowLayoutConfig
    });

    const requiredAboveSpaceConfig = {
      laneGap: EFFECTIVE_ABOVE_LANE_GAP,
      baseOffset: EFFECTIVE_ABOVE_BASE_CONNECTOR_LENGTH,
      buffer: AMINO_LABEL_SAFETY_BUFFER
    };
    const requiredBelowSpaceConfig = {
      laneGap: AMINO_ACID_LANE_GAP,
      baseOffset: AMINO_ACID_BASE_CONNECTOR_LENGTH,
      buffer: AMINO_LABEL_SAFETY_BUFFER
    };
    const bandMapSpaceEntry = (bandMap) =>
      bandMap.size > 0 ? [{ lane: bandMap.size - 1 }] : [];
    const requiredAboveSpace = computeRequiredLabelSpace(
      [...aboveLayout, ...bandMapSpaceEntry(aboveBandMap)],
      requiredAboveSpaceConfig
    );
    const requiredBelowSpace = computeRequiredLabelSpace(
      [...belowLayout, ...bandMapSpaceEntry(belowBandMap)],
      requiredBelowSpaceConfig
    );

    const maxLanesAbove = aboveBandMap.size;
    const maxLanesBelow = belowBandMap.size;
    if (
      maxLanesAbove > AMINO_LABEL_MAX_VISIBLE_LANES ||
      maxLanesBelow > AMINO_LABEL_MAX_VISIBLE_LANES
    ) {
      console.warn(
        `Visualization -> amino-acid label lanes (${maxLanesAbove} above, ${maxLanesBelow} below) exceed the typical expected maximum (${AMINO_LABEL_MAX_VISIBLE_LANES}); the SVG is expanded to fit them regardless.`
      );
    }

    return { aboveLayout, belowLayout, requiredAboveSpace, requiredBelowSpace };
  };

  const fullAminoAcidLayout = buildAminoAcidLabelLayout(false);
  const windowAminoAcidLayout = buildAminoAcidLabelLayout(true);

  const computeExtraVerticalSpace = (layout) => ({
    extraTop: Math.max(0, layout.requiredAboveSpace - SULFIDE_POS),
    extraBottom: Math.max(
      0,
      layout.requiredBelowSpace - (innerHeight - SULFIDE_POS)
    )
  });
  const fullExtraSpace = computeExtraVerticalSpace(fullAminoAcidLayout);
  const windowExtraSpace = computeExtraVerticalSpace(windowAminoAcidLayout);

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

  const attachSubscriptLabel = (
    g,
    { dx, dy, letter, letterClass, number, numberClass, numberDy, fill }
  ) => {
    const text = g
      .append('text')
      .attr('dx', dx)
      .attr('dy', dy)
      .attr('class', letterClass);
    if (fill) {
      text.style('fill', fill);
    }
    text.append('tspan').text(letter);
    text
      .append('tspan')
      .attr('class', numberClass)
      .attr('dy', numberDy)
      .text(number);
    return text;
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

      attachSubscriptLabel(g, {
        dx: bondPos - 8,
        dy: SULFIDE_POS - GLYCO_STEM_LENGTH - GLYCO_LINK_LENGTH * 5.5,
        letter: 'N',
        letterClass: 'glyco-labels',
        number: el,
        numberClass: 'glyco-labels--pos',
        numberDy: 5
      });

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

  const attachOGalNAcBonds = (g, isWindowView, reach) => {
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

      attachSubscriptLabel(g, {
        dx: bondPos - 8,
        dy: SULFIDE_POS - (reach + 9),
        letter: 'O',
        letterClass: 'glyco-labels',
        number: el,
        numberClass: 'glyco-labels--pos',
        numberDy: 3
      });

      const stem = g.append('line');
      stem
        .attr('x1', bondPos)
        .attr('y1', SULFIDE_POS - 10)
        .attr('x2', bondPos)
        .attr('y2', SULFIDE_POS - reach)
        .style('stroke', 'black');

      const mol = g.append('rect');
      mol
        .attr('width', 14)
        .attr('height', 14)
        .attr('x', bondPos - 7)
        .attr('y', SULFIDE_POS - reach)
        .style('stroke', 'black')
        .style('fill', 'yellow');
    });
  };

  const attachOGlcBonds = (g, isWindowView, reach) => {
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

      attachSubscriptLabel(g, {
        dx: bondPos - 8,
        dy: SULFIDE_POS - (reach + 9),
        letter: 'O',
        letterClass: 'glyco-labels',
        number: el,
        numberClass: 'glyco-labels--pos',
        numberDy: 3
      });

      const stem = g.append('line');
      stem
        .attr('x1', bondPos)
        .attr('y1', SULFIDE_POS - 10)
        .attr('x2', bondPos)
        .attr('y2', SULFIDE_POS - reach)
        .style('stroke', 'black');

      const mol = g.append('circle');
      mol
        .attr('cx', bondPos)
        .attr('cy', SULFIDE_POS - reach + CIRCLE_RADIUS)
        .attr('r', CIRCLE_RADIUS + 3)
        .style('stroke', 'black')
        .style('fill', 'blue');
    });
  };

  const attachPhosphorylation = (
    g,
    isWindowView,
    phosphorylation,
    color,
    reach
  ) => {
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
        .attr('dy', SULFIDE_POS - reach / 2)
        .text(() => `${el}`)
        .attr('class', 'glyco-labels--pos');

      const stem = g.append('line');
      stem
        .attr('x1', phosphoPos)
        .attr('y1', SULFIDE_POS - 10)
        .attr('x2', phosphoPos)
        .attr('y2', SULFIDE_POS - reach)
        .style('stroke', 'black');

      const mol = g.append('circle');
      mol
        .attr('cx', phosphoPos)
        .attr('cy', SULFIDE_POS - reach + CIRCLE_RADIUS)
        .attr('r', CIRCLE_RADIUS + 5)
        .style('fill', `${color}`);

      const atom = g.append('text');
      atom
        .attr('dx', phosphoPos - 5)
        .attr('dy', SULFIDE_POS - reach + CIRCLE_RADIUS + 6)
        .text(() => `P`)
        .attr('class', 'glyco-labels');
    });
  };

  const attachGlycationBonds = (g, isWindowView, reach) => {
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

      attachSubscriptLabel(g, {
        dx: bondPos - 8,
        dy: SULFIDE_POS - (reach + 9),
        letter: 'N',
        letterClass: 'glyco-labels',
        number: el,
        numberClass: 'glyco-labels--pos',
        numberDy: 3
      });

      const stem = g.append('line');
      stem
        .attr('x1', bondPos)
        .attr('y1', SULFIDE_POS - 10)
        .attr('x2', bondPos)
        .attr('y2', SULFIDE_POS - reach)
        .style('stroke', 'black');

      const mol = g.append('circle');
      mol
        .attr('cx', bondPos)
        .attr('cy', SULFIDE_POS - reach + CIRCLE_RADIUS)
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
          .style('stroke', RESIDUE_MARKER_STROKE)
          .style('stroke-width', RESIDUE_MARKER_STROKE_WIDTH)
          .style('fill', COLOR_PALLETE[idx % COLOR_PALLETE.length]);

        // attach stem
        const bond = g.append('line');
        bond
          .attr('x1', bondPos)
          .attr('y1', SULFIDE_POS + 20)
          .attr('x2', bondPos)
          .attr('y2', bondHeight([x, y]))
          .style('stroke', 'black');

        attachSubscriptLabel(g, {
          dx: bondPos - 5,
          dy: bondHeight([x, y]) + SULFIDE_ATOM_OFFSET,
          letter: 'C',
          letterClass: 'sulfide-labels',
          number: y,
          numberClass: 'sulfide-labels--pos',
          numberDy: 5
        });

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
          .style('stroke', RESIDUE_MARKER_STROKE)
          .style('stroke-width', RESIDUE_MARKER_STROKE_WIDTH)
          .style('fill', COLOR_PALLETE[idx % COLOR_PALLETE.length]);

        // attach stem
        const bond = g.append('line');
        bond
          .attr('x1', bondPos)
          .attr('y1', SULFIDE_POS + 20)
          .attr('x2', bondPos)
          .attr('y2', bondHeight([x, y]))
          .style('stroke', 'black');

        attachSubscriptLabel(g, {
          dx: bondPos - 5,
          dy: bondHeight([x, y]) + SULFIDE_ATOM_OFFSET,
          letter: 'C',
          letterClass: 'sulfide-labels',
          number: x,
          numberClass: 'sulfide-labels--pos',
          numberDy: 5
        });

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
          .style('stroke', RESIDUE_MARKER_STROKE)
          .style('stroke-width', RESIDUE_MARKER_STROKE_WIDTH)
          .style('fill', COLOR_PALLETE[idx % COLOR_PALLETE.length]);

        const atom2 = g.append('circle');
        atom2
          .attr('cx', yPos)
          .attr('cy', SULFIDE_POS)
          .attr('r', CIRCLE_RADIUS)
          .style('stroke', RESIDUE_MARKER_STROKE)
          .style('stroke-width', RESIDUE_MARKER_STROKE_WIDTH)
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

        attachSubscriptLabel(g, {
          dx: xPos - 5,
          dy: bondHeight(pair) + SULFIDE_ATOM_OFFSET,
          letter: 'C',
          letterClass: 'sulfide-labels',
          number: x,
          numberClass: 'sulfide-labels--pos',
          numberDy: 5
        });

        attachSubscriptLabel(g, {
          dx: yPos - 5,
          dy: bondHeight(pair) + SULFIDE_ATOM_OFFSET,
          letter: 'C',
          letterClass: 'sulfide-labels',
          number: y,
          numberClass: 'sulfide-labels--pos',
          numberDy: 5
        });
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

      attachSubscriptLabel(g, {
        dx: seqPos - 4,
        dy: SULFIDE_POS - 60,
        letter: 'N',
        letterClass: 'sulfide-labels',
        number: el,
        numberClass: 'sulfide-labels--pos',
        numberDy: 5
      });

      const atom = g.append('circle');
      atom
        .attr('cx', seqPos)
        .attr('cy', SULFIDE_POS)
        .attr('r', CIRCLE_RADIUS - 2)
        .style('stroke', 'none')
        .style('fill', 'black');
      //COLOR_PALLETE[idx % COLOR_PALLETE.length]
    });
  };

  const attachAminoAcidLabels = (g, layout, direction) => {
    layout.forEach(({ x, y, color, aminoAcid, position }) => {
      const bond = g.append('line');
      const atom = g.append('circle');

      const attachLabelText = (dx, dy) =>
        attachSubscriptLabel(g, {
          dx,
          dy,
          letter: aminoAcid,
          letterClass: 'amino-acid-label',
          number: position,
          numberClass: 'amino-acid-label--pos',
          numberDy: 5,
          fill: color || 'black'
        });

      if (direction === 'above') {
        bond
          .attr('x1', x)
          .attr('y1', SULFIDE_POS - 20)
          .attr('x2', x)
          .attr('y2', SULFIDE_POS - y)
          .style('stroke', color || 'black');

        attachLabelText(x - 4, SULFIDE_POS - (y + 10));

        atom
          .attr('cx', x)
          .attr('cy', SULFIDE_POS)
          .attr('r', CIRCLE_RADIUS - 2)
          .style('stroke', RESIDUE_MARKER_STROKE)
          .style('stroke-width', RESIDUE_MARKER_STROKE_WIDTH)
          .style('fill', color || 'black');
      } else {
        bond
          .attr('x1', x)
          .attr('y1', SULFIDE_POS + 20)
          .attr('x2', x)
          .attr('y2', SULFIDE_POS + y)
          .style('stroke', color || 'black');

        attachLabelText(x - 4, SULFIDE_POS + (y + 10));

        atom
          .attr('cx', x)
          .attr('cy', SULFIDE_POS)
          .attr('r', CIRCLE_RADIUS - 2)
          .style('stroke', color || 'black')
          .style('fill', 'white');
      }
    });
  };

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

      attachSubscriptLabel(g, {
        dx: cysPos - 4,
        dy: SULFIDE_POS + 60,
        letter: 'C',
        letterClass: 'sulfide-labels',
        number: el,
        numberClass: 'sulfide-labels--pos',
        numberDy: 5
      });

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
    // Anchored at its end so the gap to the bar is fixed at TERMINUS_LABEL_GAP
    // no matter how wide the text renders. Anchoring at the start instead made
    // the gap depend on the text width, which drifts in the SVG/PNG exports
    // where the label renders narrower than it does on screen.
    NTerm.attr('dx', SPINE_START_POS - TERMINUS_LABEL_GAP)
      .attr('dy', innerHeight / 2 + 20)
      .attr('text-anchor', 'end')
      .text(() => 'NH2 --')
      .style('font-weight', 'bold');
  };

  const attachCTerminus = (g, isWindowView) => {
    const CTerm = g.append('text');
    const spineWidth = isWindowView ? WINDOW_SPINE_WIDTH : SPINE_WIDTH;
    // Starts TERMINUS_LABEL_GAP past the bar; the default 'start' anchor already
    // pins this end, so its gap is width-independent.
    CTerm.attr('dx', SPINE_START_POS + spineWidth + TERMINUS_LABEL_GAP)
      .attr('dy', innerHeight / 2 + 20)
      .attr('text-anchor', 'start')
      .text(() => '-- COOH')
      .style('font-weight', 'bold');
  };

  const renderVisualization = (id, isWindowView) => {
    const svg = select(id);
    svg.style('background-color', 'white');

    const translateX = EFFECTIVE_HORIZONTAL_MARGIN_LEFT;
    const WINDOW_VIEW_TOP_OFFSET_DIVISOR = 25;
    const { extraTop } = isWindowView ? windowExtraSpace : fullExtraSpace;
    const translateY =
      (isWindowView ? initialWidth / WINDOW_VIEW_TOP_OFFSET_DIVISOR : 0) +
      extraTop;

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
      attachOGalNAcBonds(g, isWindowView, bandReach(aboveBandMap.get('o_glcnac')));
    }
    if (showOGlc) {
      attachOGlcBonds(g, isWindowView, bandReach(aboveBandMap.get('o_glc')));
    }
    if (showGlycation) {
      attachGlycationBonds(
        g,
        isWindowView,
        bandReach(aboveBandMap.get('glycation'))
      );
    }
    const aminoAcidLayout = isWindowView
      ? windowAminoAcidLayout
      : fullAminoAcidLayout;
    attachAminoAcidLabels(g, aminoAcidLayout.aboveLayout, 'above');
    attachAminoAcidLabels(g, aminoAcidLayout.belowLayout, 'below');
    if (showPhosphoserine) {
      attachPhosphorylation(
        g,
        isWindowView,
        phosphoserine,
        '#FDCC04',
        bandReach(aboveBandMap.get('phosphoserine'))
      );
    }
    if (showPhosphotyrosine) {
      attachPhosphorylation(
        g,
        isWindowView,
        phosphotyrosine,
        '#627DCC',
        bandReach(aboveBandMap.get('phosphotyrosine'))
      );
    }
    if (showPhosphothreonine) {
      attachPhosphorylation(
        g,
        isWindowView,
        phosphothreonine,
        '#93E37F',
        bandReach(aboveBandMap.get('phosphothreonine'))
      );
    }
    // The window view labels a terminus only when its range reaches that end
    // of the protein (both, for the default full-length window).
    if (!isWindowView || Number(windowStart) <= 1) {
      attachNTerminus(g);
    }
    if (!isWindowView || Number(windowEnd) >= Number(proteinLength)) {
      attachCTerminus(g, isWindowView);
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
        (scaleFactor - 1) * initialWidth;
    } else if (fullScale) {
      document.getElementById('svg').style.marginLeft = 0;
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
    selectedAminoAcids,
    scaleVisualization,
    scaleFactor,
    fullScale,
    windowStart,
    windowEnd,
    initialWidth,
    height
  ]);

  // The legend cards are position: fixed (top: 112px) and their height depends
  // on the protein, so the drawing can end up underneath them. Pad the SVG's
  // container down until the top of the drawn content is at least 10px below
  // the lower of the two cards. Measured in page coordinates (as at scroll 0),
  // so the result does not depend on how far the page is scrolled.
  const LEGEND_CLEARANCE = 12;
  const updateLegendClearance = () => {
    const wrapper = svgWrapperRef.current;
    const svgEl = svgRef.current;
    if (!wrapper || !svgEl || !vizRootRef.current || !svgEl.getBBox) return;
    let legendBottom = -Infinity;
    vizRootRef.current
      .querySelectorAll('[class*="legend--wrapper"]')
      .forEach((el) => {
        legendBottom = Math.max(legendBottom, el.getBoundingClientRect().bottom);
      });
    let padding = 0;
    if (legendBottom !== -Infinity) {
      const currentPadding = parseFloat(wrapper.style.paddingTop) || 0;
      const drawingTopWithoutPadding =
        svgEl.getBoundingClientRect().top +
        window.scrollY -
        currentPadding +
        svgEl.getBBox().y;
      padding = Math.max(
        0,
        Math.ceil(legendBottom + LEGEND_CLEARANCE - drawingTopWithoutPadding)
      );
    }
    wrapper.style.paddingTop = `${padding}px`;
  };

  // Runs after every render, after the drawing effect above has drawn.
  useEffect(() => {
    updateLegendClearance();
  });

  // The legend cards can change height without this component re-rendering
  // (tab switches, chip selection, web fonts loading), so watch their size.
  useEffect(() => {
    if (typeof ResizeObserver === 'undefined' || !vizRootRef.current) {
      return undefined;
    }
    const observer = new ResizeObserver(() => updateLegendClearance());
    vizRootRef.current
      .querySelectorAll('[class*="legend--wrapper"]')
      .forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [isLegendOpen, currSelection]);

  const svgWrapperClassName =
    scaleVisualization || fullScale ? 'svg-wrapper' : 'svg-wrapper--centered';

  const svg = Number.isInteger(currSelection) ? (
    <div className={svgWrapperClassName} ref={svgWrapperRef}>
      <svg
        style={
          fullScale ? {} : { marginLeft: (scaleFactor - 1) * initialWidth }
        }
        height={`${
          height +
          fullExtraSpace.extraTop +
          fullExtraSpace.extraBottom +
          PROTEIN_WINDOW_CARD_CLEARANCE
        }`}
        width={`${
          fullScale
            ? proteinLength + margin.left * 2
            : initialWidth * scaleFactor
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
        height={`${
          height + windowExtraSpace.extraTop + windowExtraSpace.extraBottom
        }`}
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
    <div ref={vizRootRef}>
      {isLegendOpen ? (
        <Legend
          glycoslation={glycoslation}
          o_glcnac={o_glcnac}
          o_glc={o_glc}
          glycation={glycation}
          disulfideBonds={disulfideBonds}
          sequons={sequons}
          cysteines={cysteines}
          aminoAcids={aminoAcids}
          selectedAminoAcids={selectedAminoAcids}
          toggleAminoAcid={toggleAminoAcidSelection}
          phosphoserine={phosphoserine}
          phosphothreonine={phosphothreonine}
          phosphotyrosine={phosphotyrosine}
          toggleGlyco={setShowGlyco}
          toggleSulfide={setShowDisulfide}
          toggleOutside={setShowOutisde}
          toggleInside={setShowInside}
          toggleSequons={setShowSequons}
          toggleCysteines={setShowCysteines}
          length={proteinLength}
          species={species}
        />
      ) : null}
      {svg}
      <div className="window-section">
        <ProteinWindow
          length={proteinLength}
          updateWindowStart={updateWindowStart}
          updateWindowEnd={updateWindowEnd}
        />
        {windowSvg}
      </div>
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
