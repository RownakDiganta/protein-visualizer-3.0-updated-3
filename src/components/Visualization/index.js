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
  AMINO_LABEL_MAX_VISIBLE_LANES,
  AMINO_ACID_BASE_CONNECTOR_LENGTH,
  AMINO_ACID_LANE_GAP,
  AMINO_LABEL_SAFETY_BUFFER,
  buildTypeBandMap,
  layoutAminoAcidLabelsByType,
  computeRequiredLabelSpace
} from './labelPlacement';
// #RD END

import './index.scss';

const CIRCLE_RADIUS = 5;
const SPINE_HEIGHT = 30;
// #RD START
// Residue-marker circles (disulfide/free-cysteine-pair atoms, the amino-acid
// "solid" style marker) used a flat `stroke: white` for definition against
// the spine's own fill - per professor feedback ("remove the white line
// around the sign"), that read as an unwanted white ring/halo, most visible
// where a marker's fill color sits close in hue/lightness to the spine
// segment under it (e.g. a pink/magenta palette entry on the pink "outside
// domain" spine). A flat, low-opacity dark stroke gives the same
// pixel-level edge definition (so a marker's boundary is still crisp against
// any of the spine's fill colors - white, pink, or purple/blue) without ever
// reading as a distinct white ring; it's deliberately thin (1px) so it never
// becomes a second thick outline of its own. This is NOT used on markers
// that are already black-filled (e.g. the free-sequon marker) - a solid
// black fill needs no extra border to stay visible on any background, so
// those markers now render with no stroke at all.
const RESIDUE_MARKER_STROKE = 'rgba(0, 0, 0, 0.35)';
const RESIDUE_MARKER_STROKE_WIDTH = 1;
// #RD END

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
  // Lowers the FULL-LENGTH view only, per feedback that it sat too close to
  // the top of the page (in the same vertical band as the Legend/"Amino
  // acids and mods" panels) and needed a clear open gap below the panels
  // before the spine starts. Added directly to translateY below (not to
  // margin.top, which also drives innerHeight/SULFIDE_POS - the diagram's
  // own internal vertical layout, e.g. how far labels sit above/below the
  // spine, is unrelated to where the whole drawing group sits on the page).
  // The SVG's own declared height grows by the same amount (see the
  // height attr on #svg below) so the extra space is real reserved layout,
  // not overflow:visible bleed that would clip in exports - and since the
  // Protein Window Input card sits in normal flow right after this SVG, the
  // taller SVG naturally pushes it further down the page too, keeping their
  // existing gap instead of colliding with the lowered diagram.
  // #RD START
  // Reduced from 430 - per feedback to move the diagram back toward the
  // vertical position of Murphy's reference deployment (murphv.github.io/
  // Protein-Visualizer-3.0/), specifically ~200px higher than the 430
  // version sat. Murphy's own version has no equivalent shift at all (it
  // predates this fix entirely) and instead uses an UNCAPPED
  // window.innerHeight-driven margin, so its own on-screen position moves
  // with window height in a way this fixed pixel constant deliberately
  // does not (VISUALIZATION_HEIGHT_CAP in App.jsx already caps that
  // per-render height source, a separate, earlier, still-intact fix) -
  // there is no single pixel-for-pixel equivalent between the two designs,
  // so this value is calibrated to the requested ~200px reduction rather
  // than an exact cross-site measurement.
  // #RD START
  // +13 (230 -> 243) - a further small nudge down per follow-up feedback
  // comparing directly against Murphy's live deployment.
  const DIAGRAM_VERTICAL_SHIFT = 243;
  // #RD END
  // #RD END

  // #RD START
  // Pure reserved BOTTOM padding on the full-length #svg only - added to its
  // declared height (see the height attr on #svg below) but NOT to
  // translateY, so it never moves the upper diagram itself (backbone,
  // labels, brackets all stay exactly where DIAGRAM_VERTICAL_SHIFT put
  // them). Its only job is to set how far below the upper diagram
  // .window-section (the Protein Window Input card AND the window-view
  // diagram below it, wrapped together - see the window-section div below)
  // sits, in normal document flow - since .window-section's own position is
  // entirely determined by what precedes it (this #svg's height) plus its
  // own fixed margin-top/gap (index.scss, both untouched here), this ONE
  // value is what moves the card+lower-diagram block as a single unit
  // without touching the spacing between the two of THEM.
  //
  // Originally 500 (sized so the card sat fully below the fold - Murphy's
  // reference deployment does the same via an uncapped, height-driven
  // margin that has no equivalent here, see DIAGRAM_VERTICAL_SHIFT's comment
  // above). Reduced by exactly 200 per feedback asking the card and lower
  // diagram to move up 200px as one block, closing that much of the gap
  // between them and the upper diagram - this necessarily gives up some of
  // that below-the-fold margin at shorter viewport heights (see the
  // collision-check measurements in the commit/PR notes for this change);
  // the upper diagram and the .window-section-internal spacing are both
  // unaffected either way.
  const PROTEIN_WINDOW_CARD_CLEARANCE = 300;
  // #RD END

  // #RD START
  // Reserves horizontal margin, for the FULL-LENGTH view only, on each edge
  // of the viewport - one pair of shared constants (left/right) drives both
  // views, so a given side always gets the same margin at any window width
  // instead of each side being sized independently per view. Per feedback,
  // an earlier version reserved the two sides separately in a way that
  // produced an unintentional lopsided overshoot (see the removed
  // single-EQUAL-margin comment this replaced) - that was fixed by forcing
  // both sides equal. This later round of feedback asked to widen the RIGHT
  // side specifically (extend that edge outward) while leaving the LEFT
  // edge exactly where it was, which an equal-margin constant can't express
  // by itself - so the single DIAGRAM_HORIZONTAL_MARGIN is now two
  // independent constants, left and right, instead of reintroducing a
  // shared-but-still-equal value.
  //
  // DIAGRAM_HORIZONTAL_MARGIN_LEFT/_RIGHT are the actual on-screen margins
  // from the viewport edge to the bar's edge on that side (left edge = LEFT
  // value; right edge = scaledWidth - RIGHT value). LEFT is unchanged from
  // the prior equal-margin value (translateX + SPINE_START_POS) - the bar's
  // left edge was already confirmed correct and explicitly must not move.
  const DIAGRAM_HORIZONTAL_MARGIN_LEFT = 360;
  // #RD START
  // Decreased from 360 (the old equal-margin value) by ~63 - per feedback
  // that the bar's right edge should extend outward by about that amount
  // while the left edge stays put, i.e. an asymmetric margin rather than
  // the equal-margin design used previously. Shrinking the right-side
  // reservation is what pushes the right edge outward (bar edge = scaledWidth
  // - this value), consistent with the same margin-drives-edge relationship
  // the left constant already uses.
  const DIAGRAM_HORIZONTAL_MARGIN_RIGHT = 297;
  // #RD END
  // #RD END

  // #RD START
  // Below some viewport width, LEFT + RIGHT no longer fits, which would
  // drive SPINE_WIDTH negative - confirmed in an earlier measurement that a
  // negative width doesn't just shrink the diagram, it flips the
  // residue-position scale's direction, so labels render out of sequence
  // order and pile on top of each other (a real rendering bug, distinct
  // from "cramped but correct"). The _MIN constants are smaller floors for
  // that narrow-viewport case (each derived the same way, keeping the same
  // 30px gap below its own ideal value the equal-margin version used);
  // MIN_SPINE_WIDTH is the last-resort floor once even that leaves no room -
  // it trades a visually tiny diagram for never re-inverting.
  const DIAGRAM_HORIZONTAL_MARGIN_LEFT_MIN = 330;
  const DIAGRAM_HORIZONTAL_MARGIN_RIGHT_MIN = 267;
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
  // #RD END

  const SPINE_WIDTH = Math.max(
    MIN_SPINE_WIDTH,
    scaledWidth -
      scaleFactor *
        (EFFECTIVE_HORIZONTAL_MARGIN_LEFT + EFFECTIVE_HORIZONTAL_MARGIN_RIGHT)
  );

  // #RD START
  // The window view used to compute its own SEPARATE margin/width here
  // (WINDOW_VIEW_TRANSLATE_X, WINDOW_SPINE_MARGIN_RATIO, and its own
  // WINDOW_SPINE_START_POS/WINDOW_SPINE_WIDTH formulas) instead of sharing
  // EFFECTIVE_HORIZONTAL_MARGIN with the full-length view above - that's
  // exactly why the symmetric-margin fix applied to the full-length view
  // didn't reach the window view: they were two independently-computed
  // values that happened to agree only by coincidence, not two views reading
  // one shared source.
  //
  // WINDOW_SPINE_START_POS aliases SPINE_START_POS directly - both views
  // start their spine the same small distance from their own drawing
  // group's origin, nothing view-specific about that value.
  //
  // WINDOW_SPINE_WIDTH shares EFFECTIVE_HORIZONTAL_MARGIN_LEFT/_RIGHT (the
  // actual thing that needed to be shared to fix the margin mismatch) but is
  // NOT a bare alias of SPINE_WIDTH - SPINE_WIDTH is sized against
  // scaledWidth (initialWidth * scaleFactor), because the full-length view's
  // own horizontal-scale slider (scaleVisualization/fullScale) intentionally
  // stretches ONLY that view wider than the viewport. The window view's own
  // <svg> width attribute always stays at the unscaled initialWidth (see the
  // windowSvg width prop below) - it was never affected by that slider and
  // still shouldn't be, so this is sized against initialWidth instead of
  // scaledWidth. If it aliased SPINE_WIDTH directly, moving the full view's
  // scale slider would silently stretch the window view's content past its
  // own SVG's declared width too, clipped in every export.
  const WINDOW_SPINE_START_POS = SPINE_START_POS;
  const WINDOW_SPINE_WIDTH = Math.max(
    MIN_SPINE_WIDTH,
    initialWidth -
      (EFFECTIVE_HORIZONTAL_MARGIN_LEFT + EFFECTIVE_HORIZONTAL_MARGIN_RIGHT)
  );
  // #RD END

  // #RD START
  // ONE shared type -> band(lane) map, built once per render and used by
  // BOTH views and by every bandable feature type (amino acids AND
  // modifications) - the fix for the full-length and window views' label
  // tiering disagreeing with each other. They used to run two entirely
  // separate layout strategies: layoutAminoAcidLabelsByType (one fixed lane
  // per TYPE) for the full view, and layoutAminoAcidLabels (collision-aware,
  // laning individual residue OCCURRENCES regardless of type) for the window
  // view - same type could land at different heights per occurrence in the
  // window view, and had no reason to agree with the full view's per-type
  // lane at all. Both views now call layoutAminoAcidLabelsByType with this
  // SAME map, so a given type always resolves to the same band in both.
  //
  // "Above" band membership: solid-style amino acids (the default render
  // style) plus every modification - all six modification types draw above
  // the spine unconditionally (see attachOGalNAcBonds/attachOGlcBonds/
  // attachGlycationBonds/attachPhosphorylation below; none of them has a
  // "below" variant). "Below" band membership: hollow-style amino acids only
  // (currently K and W - see AMINO_ACID_RENDER_STYLE in constants.js).
  //
  // Band index = order of first appearance in selectedAminoAcids (the same
  // state array both views, and every feature type, read in the same
  // render), packed consecutively (0, 1, 2, ...) within each side via
  // buildTypeBandMap - never a raw/sparse index, so a 2-type selection
  // always uses bands 0-1 regardless of which 2 types they are, with no gap
  // left where a deselected type used to be.
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
  // Distance from the spine to a given band, in the SAME units/scale as the
  // amino-acid lane system (AMINO_ACID_BASE_CONNECTOR_LENGTH +
  // lane * AMINO_ACID_LANE_GAP) - used by the modification attach functions
  // below so their whole label/stem/marker group sits at the same height as
  // an amino acid type would in the same band, instead of each modification
  // type having its own independent fixed height (which is what let
  // multiple modification types collide with each other before).
  const bandReach = (lane) =>
    AMINO_ACID_BASE_CONNECTOR_LENGTH + lane * AMINO_ACID_LANE_GAP;
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
  // Both views now use layoutAminoAcidLabelsByType (one fixed, compact lane
  // per selected amino-acid TYPE, from the shared aboveBandMap/belowBandMap
  // above) - every occurrence of the same amino acid shares the exact same
  // connector length/height, in both views, while different types get
  // different, tightly-spaced levels. Dense same-type clusters are allowed
  // to overlap somewhat in x rather than being pushed onto per-residue
  // sub-lanes - an accepted tradeoff for staying compact, in both views.
  const buildAminoAcidLabelLayout = (isWindowView) => {
    const aboveLabels = [];
    const belowLabels = [];

    // selectedAminoAcids may also contain modification keys (see above) -
    // only actual amino-acid letters get a label here. Color assignment
    // (unchanged by this turn's tiering fix) is still based on order among
    // ONLY the letters, so an amino acid's COLOR never shifts depending on
    // which/how many modifications happen to be selected alongside it - this
    // is deliberately a separate index from the shared band/lane (aboveBandMap/
    // belowBandMap above), which DOES include modifications, since color and
    // vertical band are independent concerns that just happened to share one
    // index before modifications had bands of their own.
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

    // Both views now share the exact same layout function AND the exact same
    // band maps (aboveBandMap/belowBandMap, built once above) - no more
    // isWindowView branch on which algorithm or which config to use.
    const fullLayoutConfig = {
      baseConnectorLength: AMINO_ACID_BASE_CONNECTOR_LENGTH,
      laneGap: AMINO_ACID_LANE_GAP
    };
    const aboveLayout = layoutAminoAcidLabelsByType({
      labels: aboveLabels,
      side: 'above',
      bandMap: aboveBandMap,
      ...fullLayoutConfig
    });
    const belowLayout = layoutAminoAcidLabelsByType({
      labels: belowLabels,
      side: 'below',
      bandMap: belowBandMap,
      ...fullLayoutConfig
    });

    const requiredSpaceConfig = {
      laneGap: AMINO_ACID_LANE_GAP,
      baseOffset: AMINO_ACID_BASE_CONNECTOR_LENGTH,
      buffer: AMINO_LABEL_SAFETY_BUFFER
    };
    // aboveBandMap/belowBandMap may include modification-only bands that
    // never appear in aboveLayout/belowLayout at all (aboveLayout only ever
    // holds amino-acid labels) - e.g. 4 modifications selected and 0 amino
    // acids would leave aboveLayout empty even though band 3 is in use.
    // Representing the band map's own highest band as one synthetic entry
    // guarantees the required space always covers every active type on that
    // side, amino acid or modification, not just whichever are amino acids.
    const bandMapSpaceEntry = (bandMap) =>
      bandMap.size > 0 ? [{ lane: bandMap.size - 1 }] : [];
    const requiredAboveSpace = computeRequiredLabelSpace(
      [...aboveLayout, ...bandMapSpaceEntry(aboveBandMap)],
      requiredSpaceConfig
    );
    const requiredBelowSpace = computeRequiredLabelSpace(
      [...belowLayout, ...bandMapSpaceEntry(belowBandMap)],
      requiredSpaceConfig
    );

    const maxLanesAbove = aboveBandMap.size;
    const maxLanesBelow = belowBandMap.size;
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

  // #RD START
  // Draws ONE <text> element - the label's main glyph (letter) directly
  // followed by its position number as a child <tspan>, with no dx on the
  // number - shared by every residue label pair that puts a letter next to
  // its position number (N-glycan/O-GalNAc/O-Glc/glycation "N"/"O", disulfide/
  // free-cysteine "C", free-sequon "N"). Per feedback, these used to be two
  // INDEPENDENT <text> elements, each positioned by its own dx computed from
  // the same anchor x - the gap between them was whatever pixel difference
  // those two dx values happened to leave, which is only ever "flush" for the
  // one glyph width it was eyeballed against. A single text with the number
  // as a plain trailing tspan (no dx) instead lets the SVG renderer place the
  // number at the letter's own actual rendered advance width, so it's flush
  // by construction - on screen and in every export path alike, regardless of
  // font/renderer differences - with nothing to re-tune per label type.
  // numberDy is the position number's vertical drop relative to the letter's
  // baseline, kept as a param since different label types were already tuned
  // to slightly different subscript drops (5px for most, 3px for the O-linked
  // types) - purely vertical, unrelated to the horizontal gap this fixes.
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
  // #RD END

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

  // #RD START
  // reach replaces each of these 4 functions' own fixed GLYCO_STEM_LENGTH-
  // based distance-from-spine - it's the type's resolved band distance (see
  // bandReach above), so a modification type sits at the same height an
  // amino acid type would in the same band, and different modification
  // types (previously all fixed at the same height as each other, or in
  // Phosphorylation's case a different-but-still-fixed height) now land in
  // their own distinct bands instead of colliding. Each function keeps its
  // own INTERNAL relative offsets between its label/stem/marker (the small
  // fixed deltas like +9 or /2 below) exactly as they were - only the shared
  // base distance moved from a hardcoded constant to the band-driven `reach`
  // parameter, so nothing about a single instance's own look changed, only
  // where the whole group sits relative to other selected types.
  // #RD END
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
    layout.forEach(({ x, y, color, aminoAcid, position }) => {
      const bond = g.append('line');
      const atom = g.append('circle');

      // Uses the same attachSubscriptLabel helper as every other residue
      // label pair (see its definition above attachGlycoBonds) - single
      // <text>, two <tspan>s, no dx on the number, so it's flush by
      // construction in any renderer instead of relying on a hardcoded pixel
      // gap tuned against one specific font (which is what textDistance -
      // needed only for "W", the widest glyph - used to manually correct for).
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

    // #RD START
    // Same horizontal (left) margin for both views now (see
    // WINDOW_SPINE_START_POS/WINDOW_SPINE_WIDTH above) - this used to be
    // initialWidth/15 for the window view specifically, a second
    // independently-chosen value that's exactly why the window view's bar
    // didn't get the same left/right margins as the full-length view's. Only
    // the LEFT margin feeds translateX (the drawing group's origin) - the
    // right margin is expressed entirely through SPINE_WIDTH/WINDOW_SPINE_WIDTH
    // ending short of the viewport's right edge, not through any translateX
    // term, so an asymmetric left/right margin doesn't need a second
    // translate value here.
    const translateX = EFFECTIVE_HORIZONTAL_MARGIN_LEFT - SPINE_START_POS;
    // #RD END
    // #RD OLD CODE
    // const translateY = isWindowView ? initialWidth / 15 : margin.top;
    // #RD END OLD CODE
    // #RD START
    // Shift the whole drawing group down by extraTop when the current amino-acid
    // label selection needs more room above the spine than the default margin
    // provides, so dense selections get real reserved layout space (not just
    // overflow:visible bleed) instead of a fixed height that assumes few lanes.
    const { extraTop } = isWindowView ? windowExtraSpace : fullExtraSpace;
    const translateY =
      (isWindowView ? initialWidth / 15 : margin.top) +
      extraTop +
      (isWindowView ? 0 : DIAGRAM_VERTICAL_SHIFT);
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
    // #RD START
    // Reads the initialWidth PROP (App.jsx's own live, resize-reactive
    // window.innerWidth state - see its own comment there) instead of
    // reading window.innerWidth directly here - this component's SVG width
    // attribute below (see the width={...} JSX) and every geometry constant
    // above (SPINE_WIDTH, translateX, etc.) already read initialWidth, so
    // this scroll-margin calc now agrees with them by construction instead
    // of being a second, independently-read source of the same number that
    // could drift out of sync with it.
    if (scaleFactor !== 1) {
      document.getElementById('svg').style.marginLeft =
        (scaleFactor - 1) * initialWidth;
      // document.getElementById('svg').scrollIntoView({behavior: "auto", inline: "center"});
    } else if (fullScale) {
      document.getElementById('svg').style.marginLeft = 0;
      // 0.95 * proteinLength + 2 * margin.left;
    } else {
      document.getElementById('svg').style.marginLeft = 0;
    }
    // #RD END
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
    windowEnd,
    // #RD START
    // Added per the zoom-centering fix (see initialWidth's own comment on the
    // <svg> width attribute below) - initialWidth now genuinely changes after
    // mount (App.jsx's window.innerWidth state updates on resize/zoom), and
    // every piece of this diagram's geometry (SPINE_WIDTH, translateX, the
    // margins, WINDOW_SPINE_WIDTH) is derived from it. Without it listed
    // here, resizing/zooming would update the <svg>'s own declared box (that
    // JSX reads initialWidth directly, so it's always current) while the
    // actual D3-drawn content - only (re)drawn inside this effect - stayed
    // at whatever position the LAST effect run left it at, drifting out of
    // sync with the box exactly like the original bug, just one layer
    // deeper. height is included alongside it for the same reason (it feeds
    // SULFIDE_POS/innerHeight, which several attach* functions position
    // against).
    initialWidth,
    height
    // #RD END
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
          // #RD START
          // Reads the initialWidth PROP, not window.innerWidth directly - see
          // the matching comment on the marginLeft assignment in the useEffect
          // above; kept in sync with that same source for the same reason.
          fullScale ? {} : { marginLeft: (scaleFactor - 1) * initialWidth }
          // #RD END
        }
        // #RD OLD CODE
        // height={`${height}`}
        // #RD END OLD CODE
        // #RD START
        // Grows past the default height when the current amino-acid label
        // selection needs more lanes than the default margins provide room for,
        // instead of assuming a fixed height sized for only a few lanes. Also
        // grows by DIAGRAM_VERTICAL_SHIFT (see its own definition above) so the
        // lowered spine's extra vertical offset is real reserved space, not
        // overflow:visible bleed past the SVG's own declared box - genuinely
        // clipped in exports otherwise, same as the lane-space case above.
        // Also grows by PROTEIN_WINDOW_CARD_CLEARANCE (see its own definition
        // above) - pure reserved bottom padding, unrelated to the diagram's
        // own content, that exists only to push the Protein Window Input card
        // further down the page.
        height={`${
          height +
          fullExtraSpace.extraTop +
          fullExtraSpace.extraBottom +
          DIAGRAM_VERTICAL_SHIFT +
          PROTEIN_WINDOW_CARD_CLEARANCE
        }`}
        // #RD END
        // #RD START
        // Reads the initialWidth PROP, not window.innerWidth directly - this
        // is the ROOT FIX for the zoom-centering bug (see DIAGRAM_HORIZONTAL_
        // MARGIN_LEFT/_RIGHT above for the geometry that reads initialWidth
        // too). Previously this attribute read window.innerWidth LIVE while
        // every geometry constant above (SPINE_WIDTH, translateX, margins)
        // was computed from the initialWidth PROP - itself sourced from
        // App.jsx's own now-reactive window.innerWidth state (see App.jsx).
        // Both used to trace back to "the browser's width," but through two
        // INDEPENDENT reads: this one always current, the geometry one only
        // as current as whenever the App.jsx snapshot was last taken. Before
        // App.jsx's fix, that snapshot was frozen at mount forever; browser
        // zoom (ctrl +/-) changes window.innerWidth and fires 'resize'
        // without a page reload, so the two readings silently diverged the
        // moment a user zoomed - this <svg>'s own declared box grew/shrank
        // to match the new live width, while the bar drawn inside it stayed
        // positioned against the OLD width, so the .svg-wrapper--centered
        // flex wrapper's centering math (which only ever sees this element's
        // declared box size, not what's drawn inside it) placed the box off-
        // center - shifting the bar's two edges apart instead of keeping
        // them symmetric. Reading initialWidth here instead closes that gap:
        // this attribute and every geometry constant above now read the
        // exact same value on every single render, so they cannot disagree
        // even for one render, regardless of scaleFactor/fullScale/zoom
        // timing - App.jsx's resize listener is what keeps that shared value
        // itself current.
        width={`${
          fullScale
            ? proteinLength + margin.left * 2
            : initialWidth * scaleFactor
        }`}
        // #RD END
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
