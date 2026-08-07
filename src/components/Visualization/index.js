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
  // #RD START
  // Was `height - margin.top - margin.bottom` (Murphy's own formula -
  // margin.top/bottom = height/15 each). That formula is ALGEBRAICALLY
  // INERT for where the bar actually lands on the page: translateY used to
  // equal margin.top, and the bar's local y was innerHeight/2 = (height -
  // 2*margin.top)/2 = height/2 - margin.top - the margin.top terms cancel,
  // so the bar always sat at (group origin) + height/2 no matter what
  // margin.top's own divisor was. Per feedback ("move the diagram UP so it
  // overlaps the left Legend panel, the way Murphy's does"), the bar needs
  // to sit much higher up the page than height/2 gets it - margin.top's
  // divisor can't do that (it cancels), so innerHeight is now driven
  // directly by a dedicated ratio instead, decoupled from margin.top/bottom
  // (both left unchanged above - margin.left/margin.right are still used
  // for horizontal geometry, untouched by this).
  //
  // DIAGRAM_VERTICAL_RATIO expresses the bar's position within its own
  // drawing group as a fraction of the real viewport height, the same
  // "Murphy ratio" shape as his own margin.left = width/10 (a fraction of
  // viewport size, not a fixed pixel) - so it scales correctly at every
  // window height instead of only being correct at the one height it was
  // tuned against. translateY (below) no longer adds margin.top on top of
  // this, so innerHeight/2 alone is now the bar's full local offset from
  // the drawing group's own origin.
  //
  // Value derived empirically against this app's own actual measured
  // layout (svgTop, Legend panel position, search-bar position - see the
  // measurements in this turn's report) rather than solved purely
  // algebraically, since svgTop itself is an affine (not pure-ratio)
  // function of height (a fixed part from the AppBar/search-form's own
  // rendered size, plus a proportional part from .App-searchbar's 12vh) -
  // chosen so the bar clears the search box by the required 40px at the
  // shortest tested height (700px) even under maximum label compression,
  // while landing as high as possible (closest to/overlapping the Legend
  // panel) at every other tested height.
  const DIAGRAM_VERTICAL_RATIO = 0.18;
  // #RD START
  // Capped, same shape as DIAGRAM_HORIZONTAL_MARGIN_LEFT/_RIGHT's own cap
  // (Math.min(margin.left, 146)) above: a value proportional to height will
  // always eventually drift away from the Legend panel's fixed, non-
  // proportional position at SOME height, for any ratio - svgTop itself
  // also grows with height (the 12vh search-bar term), so even a capped
  // local offset doesn't hold the bar perfectly flat, but capping keeps it
  // from drifting further once past the reference height instead of
  // growing without bound. VERTICAL_RATIO_REFERENCE_HEIGHT (700) is the
  // shortest height this was verified against - the cap is the ratio's own
  // output AT that height, so heights at or below 700 are completely
  // unaffected by the cap (identical to the uncapped formula, preserving
  // the exact 64.68px-above-the-40px-floor margin measured there), while
  // taller heights stop growing past that same value instead of pushing
  // the bar further from the Legend the way an uncapped ratio would.
  const VERTICAL_RATIO_REFERENCE_HEIGHT = 700;
  const CAPPED_DIAGRAM_LOCAL_OFFSET =
    DIAGRAM_VERTICAL_RATIO * VERTICAL_RATIO_REFERENCE_HEIGHT;
  const innerHeight =
    2 *
    Math.min(DIAGRAM_VERTICAL_RATIO * height, CAPPED_DIAGRAM_LOCAL_OFFSET);
  // #RD END
  // #RD END
  const SULFIDE_POS = innerHeight / 2 + SPINE_HEIGHT / 2;
  const SULFIDE_BOND_LENGTH = 40;
  const SULFIDE_ATOM_OFFSET = 20;
  const GLYCO_STEM_LENGTH = 60;
  const GLYCO_LINK_LENGTH = 10;
  const SPINE_START_POS = 30;

  // #RD START
  // #RD OLD CODE
  // const DIAGRAM_VERTICAL_SHIFT = 243;
  // Was a fixed-pixel addition to translateY, calibrated (through several
  // rounds of feedback: 430 -> 230 -> 243) to APPROXIMATE Murphy's vertical
  // position at one specific window height. Per feedback, dropped entirely
  // now that margin.top itself is proportional to the real, uncapped window
  // height (see margin.top above and VISUALIZATION_HEIGHT_CAP's removal in
  // App.jsx) - margin.top alone now produces Murphy's actual mechanism
  // (murphy/src/components/Visualization/index.js: margin.top = height/15,
  // no separate shift term at all), so adding a fixed extra shift on top of
  // it would reintroduce exactly the "approximates one height, diverges at
  // every other height" problem this constant was already found to have.
  // #RD END OLD CODE
  // #RD END

  // #RD START
  // Pure reserved BOTTOM padding on the full-length #svg only - added to its
  // declared height (see the height attr on #svg below) but NOT to
  // translateY, so it never moves the upper diagram itself (backbone,
  // labels, brackets all stay exactly where margin.top/translateY put
  // them). Its only job is to set how far below the upper diagram
  // .window-section (the Protein Window Input card AND the window-view
  // diagram below it, wrapped together - see the window-section div below)
  // sits, in normal document flow - since .window-section's own position is
  // entirely determined by what precedes it (this #svg's height) plus its
  // own fixed margin-top/gap (index.scss, both untouched here), this ONE
  // value is what moves the card+lower-diagram block as a single unit
  // without touching the spacing between the two of THEM.
  //
  // Retuned from 300 to 76, measured against Murphy's reference deployment
  // (murphy/src/components/Visualization/index.js, run locally for
  // comparison) now that the upper diagram's own height is no longer capped
  // - removing VISUALIZATION_HEIGHT_CAP and DIAGRAM_VERTICAL_SHIFT both
  // changed how tall the upper #svg is, so the old value (tuned against the
  // capped height) no longer lands in the same place.
  //
  // Murphy's own (cardTop - backboneTop) measured cleanly as EXACTLY
  // height/2 + 100 at every tested window height (700/900/1200/1600px) -
  // his own translateY/backboneY = height/2 (margin.top=height/15 combined
  // with his innerHeight math simplifies to exactly that), and his card's
  // `top: 100px` relative-position hack (ProteinWindow/index.scss, not
  // reproduced here per the decision to keep this app's shared
  // .window-section container instead) adds a further fixed 100. Working
  // backward through THIS app's own formula - (height + clearance) + 24
  // (.window-section's margin-top) - margin.top - innerHeight/2, which
  // simplifies to height/2 + clearance + 24 - setting that equal to
  // Murphy's height/2 + 100 gives clearance = 100 - 24 = 76, independent of
  // height (the height/2 terms cancel on both sides), so this single fixed
  // value reproduces Murphy's card-to-backbone relationship at every window
  // height, not just the one it was measured against. Confirmed the
  // pre-retune value of 300 back-calculated to exactly the same formula
  // (height/2 + 300 + 24) against the actual pre-retune measurement, so the
  // formula itself isn't in question - only the constant fed into it.
  const PROTEIN_WINDOW_CARD_CLEARANCE = 76;
  // #RD END

  // #RD START
  // Reserves horizontal margin, for the FULL-LENGTH view only, on each edge
  // of the viewport - one pair of shared constants (left/right) drives both
  // views, so a given side always gets the same margin at any window width
  // instead of each side being sized independently per view.
  //
  // #RD START
  // Replaced two hand-tuned FIXED-PIXEL constants (360 left / 297 right,
  // approximating Murphy's reference deployment at one specific screen
  // width) with Murphy's own actual mechanism, ported from
  // murphy/src/components/Visualization/index.js: his `margin.left =
  // initialWidth / 10`, reused for BOTH sides (his SPINE_WIDTH formula is
  // `scaledWidth - scaleFactor * 2 * margin.left` - the same margin.left
  // value subtracted twice, not two independently-chosen numbers). A fixed
  // pixel margin only reproduces his result at the one width it was
  // measured against; this proportional formula matches where his diagram
  // actually lands at ANY width, which was the whole point of porting his
  // mechanism instead of his numbers. margin.left itself is computed once,
  // above (`const margin = {...}`) - reused here rather than redefined, the
  // same way Murphy's own code reuses his single margin.left for both
  // sides.
  //
  // #RD START
  // Per feedback, the diagram should pass BEHIND the Legend panels (an
  // intentional overlap), matching Murphy's deployed site. Investigated his
  // deployed build directly (not just this local copy) before changing
  // anything: on a FRESH page load, his own margin.left = initialWidth / 10
  // formula produces the SAME left edge his local source predicts - and,
  // critically, that formula is MATHEMATICALLY INCAPABLE of ever going
  // negative (margin.left >= 0 for any positive width, so left edge =
  // margin.left + SPINE_START_POS is always >= 30). Measured his live site
  // at 1280/1400/1600/1920/2560px wide, fresh-loaded each time: it clears
  // the left Legend panel above ~1900px wide, EXACTLY like this app already
  // did with the raw ported formula (both measured 286px at 2560px wide -
  // an exact match, not a coincidence, since it's the identical formula).
  // Separately reproduced his frozen-module-scope-width bug (resizing his
  // live tab without reloading desyncs his geometry from his own formula,
  // producing inconsistent positions) - that bug is almost certainly what
  // produced the "x < 0, clipped off the viewport" appearance being asked
  // to match; his own STABLE formula never produces that at any width, so
  // there is no stable target to literally reproduce there. Reported this
  // rather than silently chasing an unreproducible, bug-dependent number.
  //
  // What Murphy's raw formula DOES reliably provide - real, visible overlap
  // with the (fixed-width, fixed-position) Legend panels - was already
  // happening at every width up to ~1900px, but necessarily stops at wider
  // ones: a margin that grows proportionally with viewport width will
  // always eventually outgrow a panel whose width doesn't grow with it, for
  // ANY divisor. Capping the margin at the value his own formula already
  // produces for a common ~1460px-wide window (146) keeps this app
  // IDENTICAL to his raw formula (and to the previously-verified exact
  // match) at every width at or below that, while guaranteeing the overlap
  // never disappears at wider ones - confirmed by measurement: constant
  // ~90px of overlap past the left panel's right edge, and an even larger
  // margin past the right panel's left edge, at every width tested
  // including 2560px, instead of clearing it like the uncapped formula did.
  const DIAGRAM_HORIZONTAL_MARGIN_LEFT = Math.min(margin.left, 146);
  const DIAGRAM_HORIZONTAL_MARGIN_RIGHT = Math.min(margin.left, 146);
  // #RD END
  // #RD END

  // #RD START
  // Below some viewport width, LEFT + RIGHT no longer fits, which would
  // drive SPINE_WIDTH negative - confirmed in an earlier measurement that a
  // negative width doesn't just shrink the diagram, it flips the
  // residue-position scale's direction, so labels render out of sequence
  // order and pile on top of each other (a real rendering bug, distinct
  // from "cramped but correct"). Murphy's own source has no equivalent floor
  // at all - his margin.left is proportional, so it shrinks along with the
  // viewport by construction and the failure mode above mostly can't arise
  // in his design; this app keeps its own floor as a safety net for that
  // same rare pathologically-narrow case (e.g. an embedded iframe or
  // heavily resized panel).
  // #RD START
  // Recalculated from 330/267 down to 116/116 - those older values were a
  // fixed 30px gap below the PRE-overlap margin (360/297); left unchanged
  // after DIAGRAM_HORIZONTAL_MARGIN_LEFT/_RIGHT above were capped at 146,
  // they'd sit ABOVE the new normal cap instead of below it - a MIN floor
  // that's larger than the value it's meant to fall back from defeats the
  // whole point of a floor. Recalculated the same way as before (30px below
  // the new cap) so the "MIN is a smaller fallback than normal" invariant
  // holds again.
  const DIAGRAM_HORIZONTAL_MARGIN_LEFT_MIN = 116;
  const DIAGRAM_HORIZONTAL_MARGIN_RIGHT_MIN = 116;
  // #RD END
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
  // #RD START
  // Targets the topmost above-label's ACTUAL rendered position, not the
  // computeRequiredLabelSpace() space-BUDGET heuristic the previous version
  // of this clamp used - per feedback, that budget (baseOffset + numBands*
  // laneGap + a generic 20px buffer) left ~25px of real, usable space
  // unclaimed, because it doesn't match attachAminoAcidLabels' own "above"
  // formula: `attachLabelText(x - 4, SULFIDE_POS - (y + 10))` (a fixed
  // extra 10px past each label's connector length), and because an SVG
  // <text>'s `dy` sets its BASELINE, not the visual glyph top that
  // getBoundingClientRect() (and the eye) measures - a bold 1rem label's
  // glyph top sits roughly AMINO_LABEL_FONT_ASCENT_ESTIMATE px above that
  // baseline. Both were real, but neither was in the old budget, so the
  // clamp stopped compressing well before it needed to.
  //
  // Solving attachAminoAcidLabels' own formula for "topmost label's glyph
  // top sits >= TARGET_SEARCHBAR_CLEARANCE px below the search box" (the
  // same SPINE_HEIGHT/2-vs-.svg-wrapper-margin-top cancellation as before
  // still applies - see the removed comment this replaced) gives the
  // topmost band's target reach directly, which then gives the scale
  // needed to hit it - no independent "available space" budget in between
  // to drift out of sync with the real rendering again.
  const MIN_SEARCHBAR_GAP = 40;
  // Empirically measured (real getBoundingClientRect() top vs the formula's
  // own baseline math, bold 1rem Arial/Helvetica - see index.scss) - not a
  // CSS-derived exact value, since font ascent isn't queryable without a
  // live DOM measurement. TARGET_SEARCHBAR_CLEARANCE adds 3px on top of the
  // true MIN_SEARCHBAR_GAP as a small self-protective margin against this
  // estimate's own imprecision, so a few px of ascent measurement error
  // still can't push the ACTUAL clearance under the 40px hard minimum.
  const AMINO_LABEL_FONT_ASCENT_ESTIMATE = 14;
  const TARGET_SEARCHBAR_CLEARANCE = MIN_SEARCHBAR_GAP + 3;
  const AMINO_LABEL_COMPRESSION_FLOOR = 0.5;
  const numAboveBands = aboveBandMap.size;
  // Reach (from the spine) of the topmost band at the UNCOMPRESSED (scale=1)
  // spacing - what aboveCompressionScale below is a fraction/multiple of.
  const uncompressedTopmostReach =
    AMINO_ACID_BASE_CONNECTOR_LENGTH +
    Math.max(0, numAboveBands - 1) * AMINO_ACID_LANE_GAP;
  // y (local, from the spine) the topmost band needs to reach for its own
  // glyph top to land exactly TARGET_SEARCHBAR_CLEARANCE below the search
  // box - see attachLabelText's "+ 10" and the ascent estimate above; "+ 5"
  // is the SPINE_HEIGHT/2(15)-vs-.svg-wrapper-margin-top(15) cancellation
  // minus attachLabelText's own "- 10", both already explained above.
  const targetTopmostReach =
    numAboveBands === 0
      ? 0
      : SULFIDE_POS +
        5 -
        AMINO_LABEL_FONT_ASCENT_ESTIMATE -
        TARGET_SEARCHBAR_CLEARANCE;
  // No longer capped at 1 - per feedback, this should EXPAND past the
  // original spacing whenever there's more room than that needs, not stop
  // at "no compression" as its ceiling. Still floors at
  // AMINO_LABEL_COMPRESSION_FLOOR (never compresses past 50% of normal
  // spacing, so bands stay visually distinct) - if even the floor doesn't
  // reach the required clearance, spacing stays AT the floor and the
  // shortfall is reported via console.warn below rather than silently
  // letting labels overlap the search bar; computeExtraVerticalSpace's
  // existing extraTop safety net (unchanged, below) still absorbs that
  // specific residual case by growing the SVG slightly.
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
    // Reached the floor - check against the TRUE hard minimum (not the
    // padded target) to see whether it's a genuine collision worth
    // reporting, using the same actual-rendering formula as above.
    const topmostReachAtFloor =
      AMINO_LABEL_COMPRESSION_FLOOR * uncompressedTopmostReach;
    const actualGapAtFloor =
      SULFIDE_POS +
      5 -
      AMINO_LABEL_FONT_ASCENT_ESTIMATE -
      topmostReachAtFloor;
    if (actualGapAtFloor < MIN_SEARCHBAR_GAP) {
      // Reported, not silently absorbed - see extraTop's own comment above.
      console.warn(
        `Visualization -> even the minimum label spacing (${Math.round(
          AMINO_LABEL_COMPRESSION_FLOOR * 100
        )}% of normal) leaves only ~${Math.round(
          actualGapAtFloor
        )}px of clearance above the search bar (need ${MIN_SEARCHBAR_GAP}px) - the diagram's reserved space will grow slightly so labels don't visually overlap the search bar.`
      );
    }
  }
  // #RD END

  // Distance from the spine to a given band, in the SAME units/scale as the
  // amino-acid lane system (now the COMPRESSED base connector length/lane
  // gap, above, so a modification type's band sits at the same height an
  // amino acid type would in the same band under the same compression) -
  // used by the modification attach functions below so their whole
  // label/stem/marker group sits at the same height as an amino acid type
  // would in the same band, instead of each modification type having its
  // own independent fixed height (which is what let multiple modification
  // types collide with each other before).
  const bandReach = (lane) =>
    EFFECTIVE_ABOVE_BASE_CONNECTOR_LENGTH + lane * EFFECTIVE_ABOVE_LANE_GAP;
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
    // #RD START
    // Split into an above/below pair instead of one shared config - the
    // above side now uses EFFECTIVE_ABOVE_BASE_CONNECTOR_LENGTH/
    // EFFECTIVE_ABOVE_LANE_GAP (the dynamically-compressed values, see
    // their own comment above) since that's the side with the search-bar
    // clearance constraint; the below side keeps the original, uncompressed
    // AMINO_ACID_BASE_CONNECTOR_LENGTH/AMINO_ACID_LANE_GAP, since nothing
    // below the spine has that constraint. Applied identically to BOTH
    // views (full-length and window) - each still calls
    // layoutAminoAcidLabelsByType with the SAME aboveLayoutConfig/
    // belowLayoutConfig here, so a compressed band lands at the same
    // height in both, exactly like the uncompressed bands already did.
    const aboveLayoutConfig = {
      baseConnectorLength: EFFECTIVE_ABOVE_BASE_CONNECTOR_LENGTH,
      laneGap: EFFECTIVE_ABOVE_LANE_GAP
    };
    const belowLayoutConfig = {
      baseConnectorLength: AMINO_ACID_BASE_CONNECTOR_LENGTH,
      laneGap: AMINO_ACID_LANE_GAP
    };
    // #RD END
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

    // #RD START
    // Each side's required-space calc now uses that SAME side's own config
    // (compressed above, original below) - previously both sides shared one
    // config, which was correct back when both used identical spacing.
    // #RD END
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
    // #RD START
    // No longer subtracts SPINE_START_POS. That subtraction only existed to
    // cancel back out against SPINE_START_POS being re-added when the spine
    // itself is drawn at local x = SPINE_START_POS (see attachSpine) - it
    // made the OLD fixed-pixel DIAGRAM_HORIZONTAL_MARGIN_LEFT read directly
    // as "the bar's absolute on-screen left margin." Murphy's own mechanism
    // (murphy/src/components/Visualization/index.js) does NOT do this
    // cancellation - his translateX is margin.left, full stop, so his bar's
    // actual on-screen left margin is margin.left + SPINE_START_POS, not
    // margin.left alone. Dropping the subtraction here ports that mechanism
    // exactly rather than reproducing the old fixed-pixel scheme's
    // bookkeeping choice: EFFECTIVE_HORIZONTAL_MARGIN_LEFT is now Murphy's
    // margin.left value verbatim, so translateX must be exactly Murphy's
    // translateX (=margin.left) for the ported formula to land where his
    // does - confirmed by measurement, this closes an exact 30px (=
    // SPINE_START_POS) gap between mine and his left edge that the
    // subtraction was otherwise still introducing.
    const translateX = EFFECTIVE_HORIZONTAL_MARGIN_LEFT;
    // #RD END
    // #RD END
    // #RD OLD CODE
    // const translateY = isWindowView ? initialWidth / 15 : margin.top;
    // #RD END OLD CODE
    // #RD START
    // Shift the whole drawing group down by extraTop when the current amino-acid
    // label selection needs more room above the spine than the default margin
    // provides, so dense selections get real reserved layout space (not just
    // overflow:visible bleed) instead of a fixed height that assumes few lanes.
    // #RD START
    // Full view no longer adds margin.top here at all (window view's own
    // initialWidth/15 term is untouched, still Murphy's own formula for
    // that view). margin.top used to be algebraically inert for the bar's
    // final position anyway (see innerHeight's own comment above - it
    // canceled against innerHeight/2), so dropping it changes nothing about
    // where the bar lands; it's removed here only so translateY's own
    // baseline is a clean 0 (plus extraTop, the existing last-resort
    // safety net), matching the intent that DIAGRAM_VERTICAL_RATIO (via
    // innerHeight, above) is now the ONE thing controlling the bar's
    // vertical position, not two formulas that happened to cancel out.
    const { extraTop } = isWindowView ? windowExtraSpace : fullExtraSpace;
    const translateY = (isWindowView ? initialWidth / 15 : 0) + extraTop;
    // #RD END
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
        // instead of assuming a fixed height sized for only a few lanes. No
        // longer adds DIAGRAM_VERTICAL_SHIFT (removed - see margin.top/
        // translateY above); `height` itself is now the real, uncapped window
        // height (VISUALIZATION_HEIGHT_CAP removed in App.jsx), so
        // margin.top already reserves the right amount of space at the top
        // without a separate additive term. Still grows by
        // PROTEIN_WINDOW_CARD_CLEARANCE (see its own definition above) - pure
        // reserved bottom padding, unrelated to the diagram's own content,
        // that exists only to push the Protein Window Input card further
        // down the page.
        height={`${
          height +
          fullExtraSpace.extraTop +
          fullExtraSpace.extraBottom +
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
