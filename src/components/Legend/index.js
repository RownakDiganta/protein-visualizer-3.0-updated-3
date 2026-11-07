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
  Chip
} from '@material-ui/core';
import VisibilityIcon from '@material-ui/icons/Visibility';
import PropTypes from 'prop-types';
// import { MuiThemeProvider, createMuiTheme } from 'material-ui/styles';

import { makeStyles } from '@material-ui/core/styles';
import constants from '../../static/constants';
import './index.scss';

const {
  AMINO_ACIDS,
  MAX_SELECTED_AMINO_ACIDS,
  SELECTED_AMINO_ACID_COLORS,
  MODIFICATION_OPTIONS
} = constants;

const darkenColor = (hex, amount = 0.2) => {
  const num = parseInt(hex.slice(1), 16);
  const r = Math.floor(((num >> 16) & 0xff) * (1 - amount));
  const g = Math.floor(((num >> 8) & 0xff) * (1 - amount));
  const b = Math.floor((num & 0xff) * (1 - amount));
  return `rgb(${r}, ${g}, ${b})`;
};

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
      {value === index && <div>{children}</div>}
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
    marginBottom: '8px'
  },
  pos: {
    marginBottom: 12
  },
  tabs: {
    flexGrow: 1,
    backgroundColor: '#f8f8ff',
    width: '100%',
    marginBottom: '8px'
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
    aminoAcids,
    selectedAminoAcids,
    toggleAminoAcid,
    toggleGlyco,
    toggleSulfide,
    toggleOutside,
    toggleInside,
    toggleSequons,
    toggleCysteines,
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
    } else {
      toggleInside(!showInsideDomain);
      setShowInside(!showInsideDomain);
    }
  };

  const infoLeft = (
    <TabPanel index={0} value={tabValue}>
      <div className="legend--panelContent">
      <div className="legend--featureRow">
        <Typography>
          N-Glycan:
          <Typography display="inline" classes={{ root: 'bold-text' }}>
            {glycoslation.length}
          </Typography>
        </Typography>
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
      <div className="legend--featureRow">
        <Typography>
          Disulfides:
          <Typography display="inline" classes={{ root: 'bold-text' }}>
            {disulfideBonds.length}
          </Typography>
        </Typography>
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
      <div className="legend--featureRow">
        <Typography>
          Free Sequon:
          <Typography display="inline" classes={{ root: 'bold-text' }}>
            {sequons.length}
          </Typography>
        </Typography>
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
      <div className="legend--featureRow">
        <Typography>
          Free Cysteine:
          <Typography display="inline" classes={{ root: 'bold-text' }}>
            {cysteines.length}
          </Typography>
        </Typography>
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
              style={{ stroke: 'rgba(0, 0, 0, 0.35)', strokeWidth: 1 }}
            />
            <circle
              r="5"
              cx="60"
              cy="6"
              fill="#C76861"
              style={{ stroke: 'rgba(0, 0, 0, 0.35)', strokeWidth: 1 }}
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
      <div className="legend--menuSymbol">
        <Typography>Free Sequon:</Typography>
        <div className="symbol">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="80"
            height="20"
            fill="none"
          >
            <circle r="3" cx="5" cy="10" fill="black" stroke="none" />
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

  const selectedAminoAcidLetters = selectedAminoAcids.filter((key) =>
    AMINO_ACIDS.includes(key)
  );

  const modificationDataByKey = {
    o_glcnac,
    o_glc,
    glycation,
    phosphoserine,
    phosphothreonine,
    phosphotyrosine
  };

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
        <div className="legend--panelTitle">
          <Typography className={classes.title} color="textSecondary">
            Amino acids and mods
          </Typography>
          <Typography className="legend--panelSubtitle">
            (choose up to {MAX_SELECTED_AMINO_ACIDS}):
          </Typography>
        </div>
        <div className="legend--aminoAcidGrid">
          {selectableItems.map((item) => {
            const isSelected = selectedAminoAcids.includes(item.key);
            const isDisabled =
              !isSelected &&
              selectedAminoAcids.length >= MAX_SELECTED_AMINO_ACIDS;
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
  aminoAcids: PropTypes.object,
  selectedAminoAcids: PropTypes.arrayOf(PropTypes.string),
  toggleAminoAcid: PropTypes.func,
  toggleGlyco: PropTypes.func,
  toggleSulfide: PropTypes.func,
  toggleOutside: PropTypes.func,
  toggleInside: PropTypes.func,
  toggleSequons: PropTypes.func,
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
  aminoAcids: {},
  selectedAminoAcids: [],
  toggleAminoAcid: () => {}
};

export default Legend;
