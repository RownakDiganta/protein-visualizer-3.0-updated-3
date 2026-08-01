// src/components/Legend/index.js
// Left/right floating legend cards: shows counts for each protein feature (glycans,
// phosphosites, disulfides, free residues, etc.) with per-feature visibility toggles.
import React, { useState } from 'react';
import {
  Card,
  CardContent,
  Typography,
  IconButton,
  Button,
  Tooltip,
  Tab,
  Tabs,
  Paper,
  // #RD START
  Chip
  // #RD END
} from '@material-ui/core';
import VisibilityIcon from '@material-ui/icons/Visibility';
import PropTypes from 'prop-types';
// import { MuiThemeProvider, createMuiTheme } from 'material-ui/styles';

import { makeStyles } from '@material-ui/core/styles';
// #RD START
import constants from '../../static/constants';
// #RD END
import './index.scss';

// #RD START
const {
  AMINO_ACIDS,
  MAX_SELECTED_AMINO_ACIDS,
  SELECTED_AMINO_ACID_COLORS,
  MODIFICATION_OPTIONS
} = constants;

// Slightly darker variant of a slot color, used for the selected chip's border so
// it reads as a border against the same color's solid background fill.
const darkenColor = (hex, amount = 0.2) => {
  const num = parseInt(hex.slice(1), 16);
  const r = Math.floor(((num >> 16) & 0xff) * (1 - amount));
  const g = Math.floor(((num >> 8) & 0xff) * (1 - amount));
  const b = Math.floor((num & 0xff) * (1 - amount));
  return `rgb(${r}, ${g}, ${b})`;
};
// #RD END

// const theme = createMuiTheme({
//   palette: {
//     primary: '#FF6088',
//     secondary: '#7B82EE',
//   },
// });

// apple: createColor('#FF6088'),
//     skyBlue: createColor('#7B82EE'),

function TabPanel(props) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`simple-tabpanel-${index}`}
      aria-labelledby={`simple-tab-${index}`}
      {...other}
    >
      {/* #RD START */}
      {/* Plain div, not another <CardContent> - this panel already sits
          inside legendLeft's own <CardContent>, and MUI's CardContent adds
          extra (24px) bottom padding to whichever CardContent is the
          last-child of its parent. Nesting a second CardContent in here
          stacked that padding on top of the outer one, which was the actual
          source of the excess empty space at the bottom of the Legend
          card. */}
      {value === index && <div>{children}</div>}
      {/* #RD END */}
    </div>
  );
}

TabPanel.propTypes = {
  children: PropTypes.node,
  index: PropTypes.any.isRequired,
  value: PropTypes.any.isRequired
};

function a11yProps(index) {
  return {
    id: `simple-tab-${index}`,
    'aria-controls': `simple-tabpanel-${index}`
  };
}

const useStyles = makeStyles({
  root: {
    Width: 245
  },
  bullet: {
    display: 'inline-block',
    margin: '0 2px',
    transform: 'scale(0.8)'
  },
  title: {
    fontSize: 20,
    textDecoration: 'none',
    color: '#cb2d39',
    fontWeight: 'bold',
    marginBottom: '15px'
  },
  pos: {
    marginBottom: 12
  },
  tabs: {
    flexGrow: 1,
    backgroundColor: '#f8f8ff',
    width: '100%',
    marginBottom: '15px'
  },
  tab: {
    minWidth: 100,
    width: 100,
    fontSize: 10,
    fontWeight: 'bold'
  },
  card: {}
});
/**
 *
 * @param {Object} props
 * @property {Object} glycoslation object containing glyco bond info
 * @property {Object} o_glcnac object containing O-GalNAc bond info
 * @property {Object} o_glc object containing O-Glc bond info
 * @property {Object} glycation object containing N-linked Glycation bond info
 * @property {Object} disulfideBonds object containing sulfide bond info
 * @property {Object} free_s object containing Free S info
 * @property {Object} free_t object containing Free T info
 * @property {Object} free_k object containing Free K info
 * @property {Object} free_w object containing Free W info
 * @property {Object} phosphoserine object containing Phosphoserine info
 * @property {Object} phosphothreonine object containing Phosphothreonine info
 * @property {Object} phosphotyrosine object containing Phosphotyrosine info
 * @property {func} toggleGlyco Function that toggles glyco bond visibility
 * @property {func} toggleSulfide Function that toggles sulfide bond visibility
 * @property {func} toggleOutsideDomain Function that toggles Outside Domain visibility
 * @property {func} toggleInsideDomain Function that toggles Inside Domain visibility
 * @property {func} toggleSequons Function that toggles Sequons visibility
 * @property {func} toggleCysteines Function that toggles Cysteines visibility
 * @property {func} toggleFreeS Function that toggles Free S visibility
 * @property {func} toggleFreeT Function that toggles Free T visibility
 * @property {func} toggleFreeK Function that toggles Free K visibility
 * @property {func} toggleFreeW Function that toggles Free W visibility
 * @property {number} length total length of protein structure
 * @property {string} species the species that the protein belong to
 */
function Legend(props) {
  const {
    glycoslation,
    o_glcnac,
    o_glc,
    glycation,
    phosphoserine,
    phosphothreonine,
    phosphotyrosine,
    disulfideBonds,
    sequons,
    cysteines,
    // #RD OLD CODE
    // free_s,
    // free_t,
    // free_k,
    // free_w,
    // #RD END OLD CODE
    // #RD START
    aminoAcids,
    selectedAminoAcids,
    toggleAminoAcid,
    // #RD END
    toggleGlyco,
    toggleSulfide,
    toggleOutside,
    toggleInside,
    toggleSequons,
    toggleCysteines,
    // #RD OLD CODE
    // toggleFreeS,
    // toggleFreeT,
    // toggleFreeK,
    // toggleFreeW,
    // #RD END OLD CODE
    length,
    species
  } = props;
  const [tabTransparency, setTabTransparency] = useState(true);
  const [tabValue, setTabValue] = useState(0);
  const [showGlyco, setShowGlyco] = useState(true);
  const [showSulfide, setShowSulfide] = useState(true);
  const [showOutsideDomain, setShowOutside] = useState(true);
  const [showInsideDomain, setShowInside] = useState(true);
  const [showSequons, setShowSequons] = useState(false);
  const [showCysteines, setShowCysteines] = useState(false);
  // #RD OLD CODE
  // const [showFreeS, setShowFreeS] = useState(false);
  // const [showFreeT, setShowFreeT] = useState(false);
  // const [showFreeK, setShowFreeK] = useState(false);
  // const [showFreeW, setShowFreeW] = useState(false);
  // #RD END OLD CODE
  const classes = useStyles();

  const handleTabChange = (event, newTabValue) => {
    setTabValue(newTabValue);
  };

  const handleTransparency = (e) => {
    setTabTransparency(!tabTransparency);
  };

  const handleToggle = (element) => {
    if (element === 'sulfide') {
      toggleSulfide(!showSulfide);
      setShowSulfide(!showSulfide);
    } else if (element === 'glyco') {
      toggleGlyco(!showGlyco);
      setShowGlyco(!showGlyco);
    } else if (element === 'outside') {
      toggleOutside(!showOutsideDomain);
      setShowOutside(!showOutsideDomain);
    } else if (element === 'sequons') {
      toggleSequons(!showSequons);
      setShowSequons(!showSequons);
    } else if (element === 'cysteines') {
      toggleCysteines(!showCysteines);
      setShowCysteines(!showCysteines);
      // #RD OLD CODE
      // } else if (element === 'free_k') {
      //   toggleFreeK(!showFreeK);
      //   setShowFreeK(!showFreeK);
      // } else if (element === 'free_s') {
      //   toggleFreeS(!showFreeS);
      //   setShowFreeS(!showFreeS);
      // } else if (element === 'free_t') {
      //   toggleFreeT(!showFreeT);
      //   setShowFreeT(!showFreeT);
      // } else if (element === 'free_w') {
      //   toggleFreeW(!showFreeW);
      //   setShowFreeW(!showFreeW);
      // #RD END OLD CODE
    } else {
      toggleInside(!showInsideDomain);
      setShowInside(!showInsideDomain);
    }
  };

  const infoLeft = (
    <TabPanel index={0} value={tabValue}>
      {/* #RD START */}
      {/* Normal flex-column flow with `gap` (see .legend--panelContent) instead
          of the old negative-margin stacking hack - each row below occupies
          its own real vertical space and the container grows to fit however
          many rows are present, so nothing overlaps regardless of how many
          sections are added. */}
      <div className="legend--panelContent">
      {/* #RD START */}
      {/* legend--featureRow: shared 2-column grid (label+count | eye icon) so
          all four rows' icons share one exact horizontal position regardless
          of label length - see .legend--featureRow/.legend--symbolCell. The
          header row below shares that exact same grid AND the exact same
          .legend--symbolCell (left-aligned) as the icon rows, so its label's
          left edge lines up with the eye icons' actual left edge, not just
          with the column boundary. */}
      <div className="legend--featureRow legend--featureHeader">
        <div />
        <div className="legend--symbolCell">
          <Typography className="legend--symbolHeaderLabel">
            Scientific Symbol
          </Typography>
        </div>
      </div>
      <div className="legend--featureRow">
        <Typography>
          N-Glycan:
          <Typography display="inline" classes={{ root: 'bold-text' }}>
            {glycoslation.length}
          </Typography>
        </Typography>
        <div className="legend--symbolCell">
          <div className={`button-visibility${showGlyco ? '--on' : '--off'}`}>
            <Tooltip title="toggle visibility" placement="right-end">
              <IconButton
                aria-label="delete"
                className={{ root: 'on' }}
                size="small"
                onClick={() => handleToggle('glyco')}
              >
                <VisibilityIcon />
              </IconButton>
            </Tooltip>
          </div>
        </div>
      </div>
      <div className="legend--featureRow">
        <Typography>
          Disulfides:
          <Typography display="inline" classes={{ root: 'bold-text' }}>
            {disulfideBonds.length}
          </Typography>
        </Typography>
        <div className="legend--symbolCell">
          <div className={`button-visibility${showSulfide ? '--on' : '--off'}`}>
            <Tooltip title="toggle visibility" placement="right-end">
              <IconButton
                aria-label="delete"
                size="small"
                onClick={() => handleToggle('sulfide')}
              >
                <VisibilityIcon />
              </IconButton>
            </Tooltip>
          </div>
        </div>
      </div>
      {/* Moved here from the (now removed) right-side legend panel, directly
          above Topology, per professor feedback. */}
      <div className="legend--featureRow">
        <Typography>
          Free Sequon:
          <Typography display="inline" classes={{ root: 'bold-text' }}>
            {sequons.length}
          </Typography>
        </Typography>
        <div className="legend--symbolCell">
          <div className={`button-visibility${showSequons ? '--on' : '--off'}`}>
            <Tooltip title="toggle visibility" placement="right-end">
              <IconButton
                aria-label="delete"
                size="small"
                onClick={() => handleToggle('sequons')}
              >
                <VisibilityIcon />
              </IconButton>
            </Tooltip>
          </div>
        </div>
      </div>
      <div className="legend--featureRow">
        <Typography>
          Free Cysteine:
          <Typography display="inline" classes={{ root: 'bold-text' }}>
            {cysteines.length}
          </Typography>
        </Typography>
        <div className="legend--symbolCell">
          <div className={`button-visibility${showCysteines ? '--on' : '--off'}`}>
            <Tooltip title="toggle visibility" placement="right-end">
              <IconButton
                aria-label="delete"
                size="small"
                onClick={() => handleToggle('cysteines')}
              >
                <VisibilityIcon />
              </IconButton>
            </Tooltip>
          </div>
        </div>
      </div>
      {/* #RD END */}
      {/* Topology reserves its own real row height for the label + both
          badges - align-items: center (from .legend--menuItem) vertically
          centers all three instead of needing manual marginTop nudges on
          each child. */}
      <div className="legend--menuItem">
        <Typography display="inline" placement="left-end" style={{ marginRight: '0.5rem' }}>
          Topology:
        </Typography>
        <Button
          placement="right-end"
          variant="outlined"
          color="primary"
          size="small"
          style={{ marginRight: '0.5rem', minWidth: '5px' }}
          onClick={() => handleToggle('outside')}
        >
          Out
        </Button>
        <Button
          placement="right-end"
          variant="outlined"
          color="secondary"
          size="small"
          style={{ minWidth: '5px' }}
          onClick={() => handleToggle('inside')}
        >
          In
        </Button>
      </div>
      {/* #RD START */}
      {/* Moved here from the (now removed) right-side legend panel. Species
          sits below Topology purely by DOM order + the panel's gap - no
          special-cased "last row" margin needed. */}
      <div className="legend--menuItem">
        <Typography>
          Protein Length:
          <Typography display="inline" classes={{ root: 'bold-text' }}>
            {length}
          </Typography>
        </Typography>
      </div>
      <div className="legend--menuItem">
        <Typography>
          Species:
          <Typography display="inline" classes={{ root: 'bold-text' }}>
            {species}
          </Typography>
        </Typography>
      </div>
      {/* #RD END */}
      </div>
    </TabPanel>
  );

  const symbolLeft = (
    <TabPanel value={tabValue} index={1}>
      <div className="legend--panelContent">
      <div className="legend--menuSymbol">
        <Typography>N-Glycan:</Typography>
        <div className="symbol">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="100"
            height="20"
            fill="none"
          >
            <rect
              x="10"
              y="3"
              width="14"
              height="14"
              fill="blue"
              style={{ stroke: 'black' }}
            />
            <line x1="0" y1="10" x2="10" y2="10" style={{ stroke: 'black' }} />
            <rect
              x="40"
              y="3"
              width="14"
              height="14"
              fill="blue"
              style={{ stroke: 'black' }}
            />
            <line x1="24" y1="10" x2="40" y2="10" style={{ stroke: 'black' }} />
            <circle
              r="8"
              cx="76"
              cy="10"
              fill="green"
              style={{ stroke: 'black' }}
            />
            <line x1="54" y1="10" x2="68" y2="10" style={{ stroke: 'black' }} />
            <text x="86" y="16" fill="black" fontWeight="bold">
              N
            </text>
          </svg>
        </div>
      </div>
      <div className="legend--menuSymbol">
        <Typography>Disulfides:</Typography>
        <div className="symbol">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="100"
            height="20"
            fill="none"
          >
            <circle
              r="5"
              cx="20"
              cy="6"
              fill="#C76861"
              style={{ stroke: 'white' }}
            />
            <circle
              r="5"
              cx="60"
              cy="6"
              fill="#C76861"
              style={{ stroke: 'white' }}
            />
            <line x1="20" y1="18" x2="60" y2="18" style={{ stroke: 'black' }} />
            <line x1="20" y1="18" x2="20" y2="11" style={{ stroke: 'black' }} />
            <text x="5" y="18" fill="black" fontWeight="bold" fontSize="small">
              C
            </text>
            <line x1="60" y1="18" x2="60" y2="11" style={{ stroke: 'black' }} />
            <text x="65" y="18" fill="black" fontWeight="bold" fontSize="small">
              C
            </text>
          </svg>
        </div>
      </div>
      {/* #RD START */}
      {/* Moved here from the (now removed) right-side legend panel. */}
      <div className="legend--menuSymbol">
        <Typography>Free Sequon:</Typography>
        <div className="symbol">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="80"
            height="20"
            fill="none"
          >
            <circle r="3" cx="5" cy="10" fill="black" stroke="white" />
            <line x1="12" y1="10" x2="40" y2="10" stroke="black" />
            <text x="45" y="16" fill="black" fontWeight="bold">
              N
            </text>
          </svg>
        </div>
      </div>
      <div className="legend--menuSymbol">
        <Typography>Free Cysteine:</Typography>
        <div className="symbol">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="80"
            height="20"
            fill="none"
          >
            <circle r="3" cx="5" cy="10" fill="white" stroke="black" />
            <line x1="12" y1="10" x2="40" y2="10" stroke="black" />
            <text x="45" y="16" fill="black" fontWeight="bold">
              C
            </text>
          </svg>
        </div>
      </div>
      {/* #RD END */}
      </div>
    </TabPanel>
  );

  const legendLeft = (
    <Card
      variant="outlined"
      raised
      classes={{
        root: `legend--wrapper${tabTransparency ? 'Transparent' : ''}`
      }}
    >
      <CardContent>
        <div className="legend--header">
          <Typography
            className={classes.title}
            color="textSecondary"
            gutterBottom
            display="inline"
          >
            Legend
          </Typography>
          <div
            className={`button-visibility${tabTransparency ? '--off' : '--on'}`}
          >
            <Tooltip
              title="toggle transparency for legend"
              placement="right-end"
            >
              <IconButton aria-label="delete" onClick={handleTransparency}>
                <VisibilityIcon />
              </IconButton>
            </Tooltip>
          </div>
        </div>
        <Paper className={classes.tabs}>
          <Tabs
            value={tabValue}
            onChange={handleTabChange}
            variant="scrollable"
            scrollButtons="auto"
            aria-label="simple tabs example"
          >
            <Tab
              classes={{ root: classes.tab }}
              label="Protein Features"
              {...a11yProps(0)}
            />
            <Tab
              classes={{ root: classes.tab }}
              label="Scientific Symbol"
              {...a11yProps(1)}
            />
          </Tabs>
        </Paper>
        {infoLeft}
        {symbolLeft}
      </CardContent>
    </Card>
  );

  // #RD START
  // Combined amino-acid + modification selector, replacing the old
  // "Free Amino Acids" section that used to live inside the (now removed)
  // right-side "Legend and scientific symbols" panel, per professor feedback.
  //
  // selectedAminoAcidLetters mirrors the same filter Visualization/index.js
  // applies before its own amino-acid rendering loop, so a chip's slot color
  // here always matches the connector-line color actually drawn on the
  // protein - it must be computed the same way in both places since a
  // modification's presence/position in `selectedAminoAcids` must never shift
  // an amino acid's own color slot.
  const selectedAminoAcidLetters = selectedAminoAcids.filter((key) =>
    AMINO_ACIDS.includes(key)
  );

  // modificationDataByKey's keys intentionally match MODIFICATION_OPTIONS'
  // `key` values (and the existing per-protein data prop names), so a
  // modification's count can be looked up generically instead of a manual
  // per-type switch.
  const modificationDataByKey = {
    o_glcnac,
    o_glc,
    glycation,
    phosphoserine,
    phosphothreonine,
    phosphotyrosine
  };

  // Sort by count (desc) same as the amino-acid-only grid used to, now across
  // both amino acids and modifications together, so the most common items in
  // this protein show first regardless of which kind they are.
  const selectableItems = [
    ...AMINO_ACIDS.map((aminoAcid) => ({
      key: aminoAcid,
      label: aminoAcid,
      count: aminoAcids[aminoAcid] ? aminoAcids[aminoAcid].free.length : 0,
      isAminoAcid: true
    })),
    ...MODIFICATION_OPTIONS.map((mod) => ({
      key: mod.key,
      label: mod.label,
      count: (modificationDataByKey[mod.key] || []).length,
      isAminoAcid: false
    }))
  ].sort((a, b) => b.count - a.count);

  const aminoAcidsAndModsPanel = (
    <Card
      variant="outlined"
      raised
      classes={{
        root: `legend--wrapperRight${tabTransparency ? 'Transparent' : ''}`
      }}
    >
      <CardContent>
        {/* #RD START */}
        {/* "Amino acids and mods (choose up to N):" is too long to fit on
            one line at classes.title's size within this panel's width
            without shrinking the font to the point of being hard to read.
            Split into a heading ("Amino acids and mods", which DOES fit on
            one line and still uses classes.title directly - unchanged, so it
            still matches the left "Legend" heading exactly) plus a smaller
            subtitle line for the parenthetical count, so the break reads as
            an intentional title/subtitle pair instead of an awkward
            mid-sentence wrap. */}
        <div className="legend--panelTitle">
          <Typography className={classes.title} color="textSecondary">
            Amino acids and mods
          </Typography>
          <Typography className="legend--panelSubtitle">
            (choose up to {MAX_SELECTED_AMINO_ACIDS}):
          </Typography>
        </div>
        {/* #RD END */}
        <div className="legend--aminoAcidGrid">
          {selectableItems.map((item) => {
            const isSelected = selectedAminoAcids.includes(item.key);
            const isDisabled =
              !isSelected &&
              selectedAminoAcids.length >= MAX_SELECTED_AMINO_ACIDS;
            // Slot color only applies to amino-acid letters - modifications
            // render with their own fixed colors on the protein diagram (see
            // attachOGalNAcBonds/attachPhosphorylation/etc. in
            // Visualization/index.js), so giving a modification chip a
            // rainbow slot color would falsely imply a color link that
            // doesn't exist.
            const slotIndex = item.isAminoAcid
              ? selectedAminoAcidLetters.indexOf(item.key)
              : -1;
            const chipColor =
              item.isAminoAcid && isSelected && slotIndex !== -1
                ? SELECTED_AMINO_ACID_COLORS[
                    slotIndex % SELECTED_AMINO_ACID_COLORS.length
                  ]
                : null;
            return (
              <Chip
                key={item.key}
                label={`${item.label} ${item.count}`}
                size="small"
                clickable
                disabled={isDisabled}
                color={!item.isAminoAcid && isSelected ? 'primary' : 'default'}
                variant={isSelected ? 'default' : 'outlined'}
                onClick={() => toggleAminoAcid(item.key)}
                className="legend--aminoAcidChip"
                style={
                  chipColor
                    ? {
                        backgroundColor: chipColor,
                        color: '#ffffff',
                        border: `1px solid ${darkenColor(chipColor)}`
                      }
                    : undefined
                }
              />
            );
          })}
        </div>
        {selectedAminoAcids.length >= MAX_SELECTED_AMINO_ACIDS ? (
          <Typography variant="caption" style={{ color: '#cb2d39' }}>
            Maximum of {MAX_SELECTED_AMINO_ACIDS} items selected
          </Typography>
        ) : null}
      </CardContent>
    </Card>
  );
  // #RD END

  return (
    <div>
      {legendLeft}
      {aminoAcidsAndModsPanel}
    </div>
  );
}

Legend.propTypes = {
  glycoslation: PropTypes.arrayOf(PropTypes.string).isRequired,
  o_glcnac: PropTypes.arrayOf(PropTypes.string).isRequired,
  o_glc: PropTypes.arrayOf(PropTypes.string).isRequired,
  glycation: PropTypes.arrayOf(PropTypes.string).isRequired,
  phosphoserine: PropTypes.arrayOf(PropTypes.string).isRequired,
  phosphothreonine: PropTypes.arrayOf(PropTypes.string).isRequired,
  phosphotyrosine: PropTypes.arrayOf(PropTypes.string).isRequired,
  disulfideBonds: PropTypes.arrayOf(PropTypes.string).isRequired,
  sequons: PropTypes.arrayOf(PropTypes.string).isRequired,
  cysteines: PropTypes.arrayOf(PropTypes.string).isRequired,
  // #RD OLD CODE
  // free_s: PropTypes.arrayOf(PropTypes.string).isRequired,
  // free_k: PropTypes.arrayOf(PropTypes.string).isRequired,
  // free_t: PropTypes.arrayOf(PropTypes.string).isRequired,
  // free_w: PropTypes.arrayOf(PropTypes.string).isRequired,
  // #RD END OLD CODE
  // #RD START
  aminoAcids: PropTypes.object,
  selectedAminoAcids: PropTypes.arrayOf(PropTypes.string),
  toggleAminoAcid: PropTypes.func,
  // #RD END
  toggleGlyco: PropTypes.func,
  toggleSulfide: PropTypes.func,
  toggleOutside: PropTypes.func,
  toggleInside: PropTypes.func,
  toggleSequons: PropTypes.func,
  // #RD OLD CODE
  // toggleFreeS: PropTypes.func,
  // toggleFreeK: PropTypes.func,
  // toggleFreeT: PropTypes.func,
  // toggleFreeW: PropTypes.func,
  // #RD END OLD CODE
  toggleCysteines: PropTypes.func,
  length: PropTypes.number.isRequired,
  species: PropTypes.string.isRequired
};

Legend.defaultProps = {
  toggleGlyco: () => {},
  toggleSulfide: () => {},
  toggleOutside: () => {},
  toggleInside: () => {},
  toggleSequons: () => {},
  toggleCysteines: () => {},
  // #RD OLD CODE
  // toggleFreeS: () => {},
  // toggleFreeT: () => {},
  // toggleFreeK: () => {},
  // toggleFreeW: () => {},
  // #RD END OLD CODE
  // #RD START
  aminoAcids: {},
  selectedAminoAcids: [],
  toggleAminoAcid: () => {}
  // #RD END
};

export default Legend;
