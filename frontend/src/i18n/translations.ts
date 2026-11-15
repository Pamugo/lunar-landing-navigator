import type { CuratedSite, HardwareProfile } from "../types/contracts";

export type Language = "es" | "en";

export const LANGUAGE_STORAGE_KEY = "lunar_nav_lang";

export interface LocalizedSiteCopy {
  name: string;
  mission: string;
  description_tech: string;
  description_edu: string;
}

export interface LocalizedHardwareCopy {
  name: string;
  agency: string;
  description_tech: string;
  description_edu: string;
}

export interface TranslationDictionary {
  meta: {
    pageTitle: string;
  };
  languageToggle: {
    groupLabel: string;
    esTitle: string;
    enTitle: string;
  };
  header: {
    consoleAria: string;
    insignia: string;
    brandTitle: string;
    subtitleEdu: string;
    subtitleEng: string;
    sealAriaLabel: string;
    sealButtonTitle: string;
    sealBadgeText: string;
    sealModalTitle: string;
    sealOracle: string;
    sealMaxElError: string;
    sealMaxAzError: string;
    sealRmsError: string;
    sealKernelFrame: string;
    sealOpticalBending: string;
    sealSamplesSites: string;
    samplesWord: string;
    sitesWord: string;
    modeGroupAria: string;
    modeEdu: string;
    modeEng: string;
    toolbarAria: string;
    epochLabel: string;
    epochTitle: string;
    utcBadgeTitle: string;
    quickWindowsLabel: string;
    missionPresetsLabel: string;
    windowDurationLabel: string;
    windowDurationTitle: string;
    windowDaysUnit: string;
    windowOption7: string;
    windowOption14: string;
    windowOption28: string;
    hardwareLabel: string;
    presetsAria: string;
    realTimeLabel: string;
    themeDarkLabel: string;
    themeLightLabel: string;
    switchToLightTitle: string;
    switchToDarkTitle: string;
  };
  presets: Record<
    "now" | "solstice-2026" | "winter-2027" | "artemis-2027",
    {
      label: string;
      eduLabel: string;
      description: string;
    }
  >;
  app: {
    mobileNavAria: string;
    tabVisual: string;
    tabCompare: string;
    tabTimeline: string;
    visualCoreAria: string;
    visualTitleEdu: string;
    visualTitleEng: string;
    subviewTablistAria: string;
    subviewGlobe: string;
    subviewDome: string;
    subviewTerrain: string;
    customCoordHeading: string;
    hardwareLabel: string;
    customDescEdu: string;
    customDescEngPrefix: string;
    customDescEngHeight: string;
    exploreQuickmap: string;
    viewMoontrek: string;
    openAccessNote: string;
    customTimelineLabel: string;
    noSiteSelectedTitle: string;
    noSiteSelectedDesc: string;
    resizeSplitterTitle: string;
    resizeHeightTitle: string;
    resizeCornerTitle: string;
  };
  globe: {
    stageAria: string;
    noSiteSelectedPill: string;
    focusLabel: string;
    fovLabel: string;
    altitudeLabel: string;
    zoomInBtn: string;
    zoomInTitle: string;
    zoomOutBtn: string;
    zoomOutTitle: string;
    focusSiteBtn: string;
    focusSiteTitle: string;
    focusSouthPoleBtn: string;
    globalViewBtn: string;
    farSideBtn: string;
    nearSideBtn: string;
    hideCardBtn: string;
    showCardBtn: string;
    lowOrbitHint: string;
    descendBtn: string;
    psrCabeusNote: string;
    psrPolarPeakNote: string;
    historicMilestoneNote: string;
    sunVectorLegend: string;
    earthVectorLegend: string;
    mosaicLegend: string;
    eduHint: string;
    engHint: string;
  };
  terrain: {
    loading: string;
    noSiteSelected: string;
    stageAria: string;
    backToGlobe: string;
    meshBadgePrefix: string;
    meshBadgeMid: string;
    meshCellUnit: string;
    zoomInBtn: string;
    zoomInTitle: string;
    zoomOutBtn: string;
    zoomOutTitle: string;
    siteSelectorLabel: string;
    customSiteShort: string;
    showSiteTitlePrefix: string;
    showSiteTitleSuffix: string;
    activeMastLabel: string;
    eduColorNote: string;
    engSourcePrefix: string;
  };
  dome: {
    loading: string;
    noSiteSelected: string;
    stageAria: string;
    svgAria: string;
    siteSelectorLabel: string;
    topographicSourceLabel: string;
    sphericalFallback: string;
    lolaPolarDem: string;
    exaggerationAria: string;
    verticalScaleLabel: string;
    cardinalN0: string;
    cardinalE90: string;
    cardinalS180: string;
    cardinalW270: string;
    cardinalN360: string;
    sunWord: string;
    earthWord: string;
    horizonLineLegend: string;
    windowStartLegend: string;
    demElevLabel: string;
    mastLabel: string;
    eduHint: string;
    engVacuumLabel: string;
    engBendingNote: string;
  };
  polarMap: {
    stageAria: string;
    projectionLabel: string;
    towardEarth: string;
    farSide: string;
    eduHint: string;
    engHint: string;
  };
  countdown: {
    ariaLabel: string;
    windowExceed: string;
    nextSunsetEdu: string;
    timeToSunsetEng: string;
    nextEarthsetEdu: string;
    timeToEarthsetEng: string;
    noCrossing: string;
  };
  timeline: {
    sectionAria: string;
    titleEdu: string;
    titleEng: string;
    yAxisEdu: string;
    yAxisEng: string;
    sunSeriesName: string;
    earthSeriesName: string;
    localHorizonLabel: string;
    goldenWindowBadge: string;
    sunWord: string;
    earthDteWord: string;
    utcStartLabel: string;
    durationLabel: string;
    duration7: string;
    duration14: string;
    duration28: string;
    pauseBtn: string;
    playBtn: string;
    scrubberAria: string;
    noSiteSelectedHint: string;
    engPlannerSubtitle: string;
    sunLegendTitle: string;
    sunLegendDesc: string;
    earthLegendTitle: string;
    earthLegendDesc: string;
    horizonLegendTitle: string;
    horizonLegendDesc: string;
    bandGoldenLabel: string;
    bandSolarOnlyLabel: string;
    bandEclipseLabel: string;
    telemetryUtcLabel: string;
    telemetrySunMarginLabel: string;
    telemetryEarthMarginLabel: string;
    telemetryHorizonShort: string;
    stateGoldenBadge: string;
    stateSolarOnlyBadge: string;
    stateEclipseBadge: string;
    telemetryLiveCursorHint: string;
    telemetryScrubberHint: string;
    siteSelectorLabel: string;
  };
  comparison: {
    panelAria: string;
    titleEdu: string;
    titleEng: string;
    eduWindowTitle: string;
    closeAllBtn: string;
    closeAllTitle: string;
    profileLabel: string;
    sortLabel: string;
    sortViability: string;
    sortSolar: string;
    sortDte: string;
    sortGolden: string;
    sortDefault: string;
    exportCsvBtn: string;
    exportCsvTitle: string;
    exportPdfBtn: string;
    exportPdfTitle: string;
    catalogAria: string;
    removeSiteChipTitlePrefix: string;
    removeSiteChipTitleSuffix: string;
    addSiteChipTitlePrefix: string;
    latPlaceholder: string;
    latAria: string;
    lonPlaceholder: string;
    lonAria: string;
    evaluateCoordBtn: string;
    emptyTitle: string;
    emptyEdu: string;
    emptyEng: string;
    cardAriaPrefix: string;
    optimalSiteBadge: string;
    viabilityRankLabel: string;
    ptsUnit: string;
    pillarSun: string;
    pillarDte: string;
    pillarTherm: string;
    customSiteTitle: string;
    removeCardTitle: string;
    removeCardAriaPrefix: string;
    showingInTerrain: string;
    activeInViewer: string;
    showInTerrainBtn: string;
    showInTerrainTitle: string;
    focusAndShowInTerrainTitle: string;
    mastHeightLabel: string;
    mastHeightAriaPrefix: string;
    changeHeightTitlePrefix: string;
    applyBtn: string;
    applyTitle: string;
    heightRangeHint: string;
    customHeightAriaPrefix: string;
    heightPresetsAria: string;
    sunTitle: string;
    earthTitle: string;
    stateVisible: string;
    statePartial: string;
    stateOcculted: string;
    clearanceLabel: string;
    sunPowerEdu: string;
    sunShadowEdu: string;
    dteActiveBadge: string;
    dteNoLinkBadge: string;
    dteAvailableEdu: string;
    dteBlockedEdu: string;
    kpiSun: string;
    kpiDte: string;
    kpiGolden: string;
    maxNightEdu: string;
    daySingularUnit: string;
    daysUnit: string;
    maxDarknessEng: string;
    meanSunElEng: string;
    horizonSpherical: string;
    horizonLolaDem: string;
    dteHeaderTitle: string;
    clearanceTitlePrefix: string;
    badgeClear: string;
    badgeBlocked: string;
    zeroDteTitle: string;
    zeroDteDesc: string;
    antennaPointingLabel: string;
    librationBoxLabel: string;
    librationBoxTitle: string;
    spanWord: string;
    earthDistanceLabel: string;
    latencyLabel: string;
    owltRttTitlePrefix: string;
    owltRttMid: string;
    minMaxClearanceLabel: string;
    fsplTitle: string;
    sBandChip: string;
    sBandTitle: string;
    xBandChip: string;
    xBandTitle: string;
    kaBandChip: string;
    kaBandTitle: string;
    maxBlackoutLabel: string;
    continuous100: string;
    goldenWindowLabel: string;
    netHoursUnit: string;
    solarHeaderPrefix: string;
    optimalAzimuthBadgePrefix: string;
    optimalAzimuthTitle: string;
    totalShadowTitle: string;
    totalShadowDesc: string;
    fixedVerticalLabel: string;
    starOptimal: string;
    ofTracking: string;
    advantageVsFlatLabel: string;
    equivalentLabel: string;
    infGroundZero: string;
    verticalTrackingLabel: string;
    ceiling100: string;
    horizontalGroundLabel: string;
    peakLabel: string;
    meanLabel: string;
    manualOrientationLabel: string;
    resetOptimalBtnPrefix: string;
    resetOptimalTitle: string;
    adjustAzimuthAriaPrefix: string;
    compassWLabel: string;
    misalignmentPrefix: string;
    misalignmentVsOpt: string;
    compassAriaPrefix: string;
    compassOptimalAt: string;
    compassTotalShadowTitle: string;
    compassSectorShadowStart: string;
    compassSectorShadowAnd: string;
    compassTotalShadowWarning: string;
    compassPillPanel: string;
    compassPillOptimal: string;
    compassPillSun: string;
    compassCaptures: string;
    compassRear: string;
    compassPillEarth: string;
    compassShadowPrefix: string;
    compassShadowBlocked: string;
    compassClickToPointPrefix: string;
    compassLegend: string;
    pvToggleBtn: string;
    pvToggleTitle: string;
    pvAreaLabel: string;
    pvAreaAria: string;
    pvAreaUnit: string;
    pvEffLabel: string;
    pvEffAria: string;
    pvEffNote: string;
    pvPresetRover: string;
    pvPresetLander: string;
    pvPresetBase: string;
    pvNetElectricalUnit: string;
    pvMeanPowerSuffix: string;
    pvNetBadgePrefix: string;
    quickmapBtn: string;
    quickmapTitle: string;
    moontrekBtn: string;
    moontrekTitle: string;
    popupBlockedAlert: string;
    verdictEnergyWinnerPrefix: string;
    verdictEnergyWinnerSuffix: string;
    verdictCommsWinnerPrefix: string;
    verdictCommsWinnerSuffix: string;
    verdictBalancedWinner: string;
    verdictLowDte: string;
    verdictLowSolar: string;
    verdictSecondaryPrefix: string;
    categories: Record<string, string>;
    profiles: Record<"balanced" | "energy" | "comms", { name: string; shortDesc: string }>;
    exportCsvHeaders: string[];
    printReport: {
      title: string;
      printBtn: string;
      subtitle: string;
      sealLabel: string;
      ephemNote: string;
      issueDate: string;
      missionStart: string;
      simWindow: string;
      daysUnit: string;
      missionProfile: string;
      solarArraySpec: string;
      criteriaWeights: string;
      winnerHeading: string;
      colSite: string;
      colCoord: string;
      colMast: string;
      colViability: string;
      colOptAz: string;
      colFixedEnergy: string;
      colTracking: string;
      colNetElectrical: string;
      colSunPct: string;
      colDtePct: string;
      colGolden: string;
      colClearance: string;
      colRtt: string;
      colFspl: string;
      footerLeft: string;
      footerRight: string;
    };
  };
}

export const TRANSLATIONS_EN: TranslationDictionary = {
  meta: {
    pageTitle: "Lunar Landing Site Navigator",
  },
  languageToggle: {
    groupLabel: "Interface language selector",
    esTitle: "Cambiar interfaz a Español",
    enTitle: "Switch interface to English",
  },
  header: {
    consoleAria: "NASA mission control bar",
    insignia: "NASA SPACE APPS 2026",
    brandTitle: "Lunar Landing Site Navigator",
    subtitleEdu: "Interactive Moon Explorer · Sunlight & Earth Communication",
    subtitleEng: "South Polar Mission Planning Console",
    sealAriaLabel: "Scientific Verification Seal",
    sealButtonTitle: "View validation results against the official NASA JPL Horizons oracle",
    sealBadgeText: "JPL Horizons Verified",
    sealModalTitle: "Verified Accuracy vs. NASA JPL Horizons",
    sealOracle: "Oracle",
    sealMaxElError: "Max Elevation Error",
    sealMaxAzError: "Max Azimuth Error",
    sealRmsError: "RMS Error (El / Az)",
    sealKernelFrame: "Kernel / Lunar Frame",
    sealOpticalBending: "Optical Bending",
    sealSamplesSites: "Samples / Sites",
    samplesWord: "samples",
    sitesWord: "sites",
    modeGroupAria: "Interface mode selector",
    modeEdu: "Educational Mode",
    modeEng: "Engineer Mode",
    toolbarAria: "Mission time simulation parameters",
    epochLabel: "Mission Epoch T₀ (UTC):",
    epochTitle: "Freely pick any future UTC date and time (JPL DE421 coverage through 2053)",
    utcBadgeTitle: "Coordinated Universal Time (UTC Zulu)",
    quickWindowsLabel: "Quick Windows:",
    missionPresetsLabel: "Mission Presets:",
    windowDurationLabel: "Window:",
    windowDurationTitle: "Duration of continuous simulation window (1 to 365 days)",
    windowDaysUnit: "days",
    windowOption7: "7 days (1/4 lunar cycle)",
    windowOption14: "14 days (Half month / polar day)",
    windowOption28: "28 days (Full draconic cycle)",
    hardwareLabel: "LANDER/ROVER HEIGHT (h₀):",
    presetsAria: "Mission time window shortcuts",
    realTimeLabel: "Real time",
    themeDarkLabel: "Dark Mode",
    themeLightLabel: "Light Mode",
    switchToLightTitle: "Switch to Light Mode",
    switchToDarkTitle: "Switch to Dark Mode",
  },
  presets: {
    now: {
      label: "⏱ Now (UTC)",
      eduLabel: "⏱ Now (UTC)",
      description: "Current date and time in Coordinated Universal Time (UTC)",
    },
    "solstice-2026": {
      label: "☀ South Solstice (Dec 21, 2026)",
      eduLabel: "☀ South Solstice (Dec 21, 2026)",
      description: "Peak solar illumination and shortest shadow lengths at the South Pole",
    },
    "winter-2027": {
      label: "🌑 South Winter (Jun 21, 2027)",
      eduLabel: "🌑 South Winter (Jun 21, 2027)",
      description: "Lowest solar elevation and critical topographic shadows for survival",
    },
    "artemis-2027": {
      label: "🚀 Artemis Window (Sep 15, 2027)",
      eduLabel: "🚀 Artemis Window (Sep 15, 2027)",
      description: "Candidate launch window for Artemis polar lunar landing",
    },
  },
  app: {
    mobileNavAria: "Mobile touch navigation",
    tabVisual: "1. 3D Globe & Horizon",
    tabCompare: "2. Comparator",
    tabTimeline: "3. Timeline",
    visualCoreAria: "3D visual core and lunar horizon",
    visualTitleEdu: "3D lunar visual explorer and horizon",
    visualTitleEng: "3D lunar visual explorer and horizon",
    subviewTablistAria: "Spatial view selector",
    subviewGlobe: "3D Lunar Globe",
    subviewDome: "360° Horizon Dome",
    subviewTerrain: "3D LOLA Terrain",
    customCoordHeading: "Custom Lunar Coordinate",
    hardwareLabel: "Hardware:",
    customDescEdu:
      "Custom point on the lunar surface. Watch how Sun and Earth visibility change depending on latitude and mast height.",
    customDescEngPrefix: "MOON_ME topographic evaluation with instrument height",
    customDescEngHeight: "h₀ =",
    exploreQuickmap: "↗ Explore in LROC QuickMap (quickmap.lroc.im-ldi.com)",
    viewMoontrek: "↗ View in NASA Moon Trek",
    openAccessNote: "★ Open access to LOLA illumination/horizon (restricted to JPL accounts in Moon Trek)",
    customTimelineLabel: "Custom",
    noSiteSelectedTitle: "No lunar site selected",
    noSiteSelectedDesc:
      "Click anywhere on the 3D Moon or pick a candidate site in the comparator to inspect solar illumination, local horizon, and Direct-to-Earth visibility.",
    resizeSplitterTitle: "Drag to resize Moon and Comparator panels · Double-click to reset",
    resizeHeightTitle: "Drag border to resize panel height · Double-click to reset",
    resizeCornerTitle: "Drag corner to resize width and height · Double-click to reset",
  },
  globe: {
    stageAria: "Photorealistic 3D Lunar Globe with real NASA LROC WAC imagery and Auto-LOD to 3D Terrain",
    noSiteSelectedPill: "No site selected",
    focusLabel: "Focus:",
    fovLabel: "FOV",
    altitudeLabel: "Altitude:",
    zoomInBtn: "＋ Zoom",
    zoomInTitle: "Zoom in camera (at low orbit automatically transitions to LOLA 3D Surface)",
    zoomOutBtn: "－ Zoom",
    zoomOutTitle: "Zoom out camera",
    focusSiteBtn: "Focus Site",
    focusSiteTitle: "Fly to low orbit above the selected site",
    focusSouthPoleBtn: "South Pole",
    globalViewBtn: "Global View",
    farSideBtn: "Far Side",
    nearSideBtn: "Near Side",
    hideCardBtn: "Hide Card",
    showCardBtn: "Mission Card",
    lowOrbitHint: "Keep zooming in for automatic descent to LOLA 3D Surface",
    descendBtn: "⛰️ Descend to Local 3D Surface (LOLA DEM 128×128) →",
    psrCabeusNote: "❄️ PSR Region (Permanently Shadowed): cold trap with water ice confirmed by LCROSS (2009).",
    psrPolarPeakNote:
      "☀️ Polar Peak next to PSR craters: near-continuous grazing sunlight just km from ice reserves.",
    historicMilestoneNote: "🚀 Historic Lunar Exploration Milestone: path connected on the 3D globe.",
    sunVectorLegend: "● Sun Vector",
    earthVectorLegend: "● Earth Vector (DTE)",
    mosaicLegend: "● NASA LROC WAC + LOLA 16-bit Photo Mosaic",
    eduHint: "Scroll to zoom · Click anywhere on the Moon to open it in the comparator",
    engHint: "Zoom with auto-transition to LOLA 3D Terrain · Click sets MOON_ME coordinates",
  },
  terrain: {
    loading: "Loading LOLA 3D topographic mesh (128×128)...",
    noSiteSelected: "Select a site on the 3D Globe or comparator to explore its 3D LOLA terrain",
    stageAria: "Local 128x128 LOLA 3D topographic surface with lunar relief shading",
    backToGlobe: "← Back to 3D Globe",
    meshBadgePrefix: "3D HD Mesh: 128×128 (LOLA DEM",
    meshBadgeMid: ",",
    meshCellUnit: "m/cell)",
    zoomInBtn: "＋ Zoom",
    zoomInTitle: "Zoom camera in to local surface",
    zoomOutBtn: "－ Zoom",
    zoomOutTitle: "Zoom camera out (zooming all the way out returns to Lunar Globe 3D)",
    siteSelectorLabel: "🗺️ Site in LOLA 3D Map:",
    customSiteShort: "Site",
    showSiteTitlePrefix: "Show",
    showSiteTitleSuffix: "in LOLA 3D Map",
    activeMastLabel: "Active mast:",
    eduColorNote: "Blue zones are deep craters; gold zones are sunlit peaks",
    engSourcePrefix: "Source:",
  },
  dome: {
    loading: "Loading 360° horizon profile...",
    noSiteSelected: "Select a site on the 3D Globe or comparator to inspect its 360° horizon",
    stageAria: "Panoramic 360-degree local horizon dome",
    svgAria: "360-degree horizon profile with Sun and Earth positions",
    siteSelectorLabel: "🔭 Site in 360° Horizon:",
    topographicSourceLabel: "Topographic Source:",
    sphericalFallback: "Analytical Spherical Fallback (R = 1737.4 km)",
    lolaPolarDem: "LOLA Polar DEM",
    exaggerationAria: "Vertical exaggeration selector",
    verticalScaleLabel: "Vertical scale",
    cardinalN0: "N (0° · Nearside)",
    cardinalE90: "E (90°)",
    cardinalS180: "S (180° · Pole)",
    cardinalW270: "W (270°)",
    cardinalN360: "N (360°)",
    sunWord: "Sun",
    earthWord: "Earth",
    horizonLineLegend: "Horizon (lunar terrain)",
    windowStartLegend: "The Sun and Earth are shown at the start instant of the window · The bottom line is the horizon",
    demElevLabel: "DEM Elev:",
    mastLabel: "Mast:",
    eduHint: "If the Sun or Earth dips below the gray silhouette, mountains block the view",
    engVacuumLabel: "Vertical scale",
    engBendingNote: "Vacuum / 0° atmospheric bending (R = 1737.4 km)",
  },
  polarMap: {
    stageAria: "Lunar South Pole 2D stereographic map",
    projectionLabel: "South Polar Stereographic Projection (80°S–90°S · MOON_ME)",
    towardEarth: "0° (Toward Earth)",
    farSide: "180° (Far Side)",
    eduHint: "Click a marker or anywhere on the map to open it in the comparator",
    engHint: "Click anywhere on the polar map to evaluate custom coordinates",
  },
  countdown: {
    ariaLabel: "Countdowns to next Sunset and Earthset",
    windowExceed: "> window",
    nextSunsetEdu: "Next Sunset",
    timeToSunsetEng: "Time to Sunset",
    nextEarthsetEdu: "Next Earthset",
    timeToEarthsetEng: "Time to Earthset (DTE)",
    noCrossing: "No crossing in window",
  },
  timeline: {
    sectionAria: "Interactive elevation timeline and time scrubber",
    titleEdu: "Solar & DTE Timeline",
    titleEng: "Synchronized Elevation & Horizon Clearance Timeline",
    yAxisEdu: "Height above horizon (°)",
    yAxisEng: "Degrees relative to horizon",
    sunSeriesName: "☀ Sun Clearance (e_☉ - γ_h)",
    earthSeriesName: "🜨 Earth DTE Clearance (e_⊕ - γ_h)",
    localHorizonLabel: "Local Horizon",
    goldenWindowBadge: "★ Golden Window (Sun + DTE)",
    sunWord: "Sun",
    earthDteWord: "Earth DTE",
    utcStartLabel: "UTC Start:",
    durationLabel: "Duration:",
    duration7: "7 days (1/4 lunar month)",
    duration14: "14 days (Half synodic month)",
    duration28: "28 days (Full draconic cycle)",
    pauseBtn: "⏸ Pause",
    playBtn: "▶ Play",
    scrubberAria: "Synchronized time scrubber",
    noSiteSelectedHint: "Select a landing site on the 3D Moon or comparator to plot its solar and DTE timeline.",
    engPlannerSubtitle:
      "Operational Window Planner: cross-references solar and Earth elevation against the LOLA terrain profile to schedule surface operations, shadow survival, and DTE downlinks.",
    sunLegendTitle: "☀ Sun Elevation (°)",
    sunLegendDesc: "Available for photovoltaic generation when above the horizon.",
    earthLegendTitle: "🜨 Earth DTE Elevation (°)",
    earthLegendDesc: "Direct Deep Space Network link when above terrain relief.",
    horizonLegendTitle: "⛰ LOLA Horizon Profile (°)",
    horizonLegendDesc: "Minimum topographic obstruction angle by azimuth at each instant.",
    bandGoldenLabel: "Golden Window (Sun + DTE)",
    bandSolarOnlyLabel: "Solar Only / No DTE",
    bandEclipseLabel: "Eclipse / Survival Mode",
    telemetryUtcLabel: "UTC",
    telemetrySunMarginLabel: "Sun Margin:",
    telemetryEarthMarginLabel: "DTE Margin:",
    telemetryHorizonShort: "Horizon",
    stateGoldenBadge: "🟢 GOLDEN WINDOW",
    stateSolarOnlyBadge: "🟡 SOLAR ONLY",
    stateEclipseBadge: "🔴 ECLIPSE / BATTERIES",
    telemetryLiveCursorHint: "Cursor",
    telemetryScrubberHint: "Scrubber",
    siteSelectorLabel: "📈 Site in Timeline:",
  },
  comparison: {
    panelAria: "Side-by-side lunar site comparator",
    titleEdu: "Lunar surface point comparator (up to 9 simultaneous scenarios)",
    titleEng: "Lunar surface point comparator (up to 9 simultaneous scenarios)",
    eduWindowTitle: "Simulated continuous window duration",
    closeAllBtn: "Close all",
    closeAllTitle: "Close all sites open in the comparator",
    profileLabel: "🎯 Profile:",
    sortLabel: "Sort:",
    sortViability: "🏆 Viability (Ranking)",
    sortSolar: "Highest Solar Illumination (%)",
    sortDte: "Highest Earth DTE Visibility (%)",
    sortGolden: "Longest Golden Window (Sun + DTE)",
    sortDefault: "Selection order",
    exportCsvBtn: "📊 Export CSV",
    exportCsvTitle: "Download full report in CSV format (.csv)",
    exportPdfBtn: "📄 Tech Sheet (PDF)",
    exportPdfTitle: "Generate executive Technical Sheet and print / save as PDF",
    catalogAria: "Curated site catalog",
    removeSiteChipTitlePrefix: "Click to remove",
    removeSiteChipTitleSuffix: "from comparator",
    addSiteChipTitlePrefix: "Add",
    latPlaceholder: "Lat °",
    latAria: "Custom latitude degrees",
    lonPlaceholder: "Lon °",
    lonAria: "Custom longitude degrees",
    evaluateCoordBtn: "Evaluate Coord.",
    emptyTitle: "No site is currently open in the comparator.",
    emptyEdu:
      "Click any of the chips above (+) or click anywhere on the Moon in the 3D Globe to open it in the comparator.",
    emptyEng:
      "Click any of the chips above (+), enter custom lunar coordinates, or select a point on the 3D Lunar Globe to add it.",
    cardAriaPrefix: "Comparison card for",
    optimalSiteBadge: "🏆 OPTIMAL SITE",
    viabilityRankLabel: "Viability",
    ptsUnit: "pts",
    pillarSun: "☀ Sun:",
    pillarDte: "🜨 DTE:",
    pillarTherm: "🛡 Therm:",
    customSiteTitle: "Custom site",
    removeCardTitle: "Remove this site from comparator",
    removeCardAriaPrefix: "Remove",
    showingInTerrain: "👁️ Showing in LOLA 3D Map",
    activeInViewer: "🎯 Active in 3D Viewer",
    showInTerrainBtn: "🗺️ Show in LOLA 3D Map",
    showInTerrainTitle: "Open this site directly in the LOLA 3D Map view",
    focusAndShowInTerrainTitle: "Focus this site and open it directly in the LOLA 3D Map",
    mastHeightLabel: "📡 Mast / Panel Height:",
    mastHeightAriaPrefix: "Mast height for",
    changeHeightTitlePrefix: "Change solar panel height to",
    applyBtn: "Apply",
    applyTitle: "Apply new mast height",
    heightRangeHint: "(0 to 100 m)",
    customHeightAriaPrefix: "Custom height in meters for",
    heightPresetsAria: "Official hardware presets",
    sunTitle: "☀ Sun",
    earthTitle: "🜨 Earth",
    stateVisible: "VISIBLE",
    statePartial: "PARTIAL",
    stateOcculted: "OCCULTED",
    clearanceLabel: "Clearance:",
    sunPowerEdu: "Solar panels generating power",
    sunShadowEdu: "Topographic shadow: using batteries",
    dteActiveBadge: "DTE ACTIVE",
    dteNoLinkBadge: "NO LINK",
    dteAvailableEdu: "Direct link to Earth available",
    dteBlockedEdu: "Earth hidden behind horizon",
    kpiSun: "☀ Sunlight (Power)",
    kpiDte: "🜨 Direct-to-Earth Link (DTE)",
    kpiGolden: "★ Golden Window (Sun + DTE)",
    maxNightEdu: "Max continuous night:",
    daySingularUnit: "day",
    daysUnit: "days",
    maxDarknessEng: "Max Darkness:",
    meanSunElEng: "Mean Sun El:",
    horizonSpherical: "Spherical",
    horizonLolaDem: "LOLA DEM",
    dteHeaderTitle: "DTE TELECOMMUNICATIONS & EARTH LINK (X / Ka BAND)",
    clearanceTitlePrefix: "Angular clearance above lunar terrain:",
    badgeClear: "✓ CLEAR",
    badgeBlocked: "⚠ BLOCKED",
    zeroDteTitle: "No Direct-to-Earth line of sight (DTE 0.0%)",
    zeroDteDesc:
      "No direct line of sight: requires lunar orbital relay satellite (e.g. Lunar Gateway, Queqiao, ESA Moonlight).",
    antennaPointingLabel: "Antenna Pointing (Az / El)",
    librationBoxLabel: "Earth Libration Box",
    librationBoxTitle: "Angular oscillation of Earth as seen from the lunar surface across the mission window",
    spanWord: "Span",
    earthDistanceLabel: "Earth Distance",
    latencyLabel: "Latency (OWLT / RTT)",
    owltRttTitlePrefix: "One-way light time:",
    owltRttMid: "Round-trip time:",
    minMaxClearanceLabel: "Min / Max Clearance",
    fsplTitle: "Free-Space Path Loss (FSPL):",
    sBandChip: "S-Band (2.2G):",
    sBandTitle: "S-Band (2.2 GHz) - Engineering command & telemetry link",
    xBandChip: "X-Band (8.4G):",
    xBandTitle: "X-Band (8.4 GHz) - Primary NASA DSN science link",
    kaBandChip: "Ka-Band (32G):",
    kaBandTitle: "Ka-Band (32.0 GHz) - Broadband & lunar HD video",
    maxBlackoutLabel: "Max continuous DTE blackout:",
    continuous100: "0.0 h (100% continuous)",
    goldenWindowLabel: "Golden Window (Sun + DTE):",
    netHoursUnit: "net h",
    solarHeaderPrefix: "⚡ AM0 Solar Irradiance",
    optimalAzimuthBadgePrefix: "🎯 Optimal Azimuth:",
    optimalAzimuthTitle:
      "Optimal azimuth for fixed vertical panel: maximizes kWh/m² while avoiding lunar mountain terrain blockage",
    totalShadowTitle: "🌑 In total topographic shadow (0 kWh/m²)",
    totalShadowDesc:
      "Surrounding mountains block the Sun throughout the entire mission window. Solar panels generate no power; the mission requires batteries or nuclear power (RTG).",
    fixedVerticalLabel: "📐 Fixed Vertical",
    starOptimal: "★ Optimal",
    ofTracking: "% of tracking",
    advantageVsFlatLabel: "Advantage vs. flat on ground:",
    equivalentLabel: "Equivalent",
    infGroundZero: "∞ (ground 0 kWh)",
    verticalTrackingLabel: "🔄 Vertical 360° Tracking",
    ceiling100: "100% (Ceiling)",
    horizontalGroundLabel: "⏹ Horizontal on Ground",
    peakLabel: "Peak:",
    meanLabel: "Mean:",
    manualOrientationLabel: "Fixed panel manual orientation:",
    resetOptimalBtnPrefix: "Reset 🎯",
    resetOptimalTitle: "Reset to calculated optimal azimuth",
    adjustAzimuthAriaPrefix: "Adjust fixed panel azimuth for",
    compassWLabel: "270° W",
    misalignmentPrefix: "⚠ Misalignment:",
    misalignmentVsOpt: "vs optimal",
    compassAriaPrefix: "Lunar solar compass: panel at",
    compassOptimalAt: "optimal at",
    compassTotalShadowTitle: "Total topographic shadow: mountains block all 360° of azimuth",
    compassSectorShadowStart: "Topographic shadow: mountains block the Sun between",
    compassSectorShadowAnd: "and",
    compassTotalShadowWarning: "🌑 In total topographic shadow",
    compassPillPanel: "📐 Panel:",
    compassPillOptimal: "🎯 Optimal:",
    compassPillSun: "☀ Sun:",
    compassCaptures: " (harvesting)",
    compassRear: " (rear-facing)",
    compassPillEarth: "🜨 Earth:",
    compassShadowPrefix: "⛰ Shadow (",
    compassShadowBlocked: "° blocked)",
    compassClickToPointPrefix: "Click to orient panel to",
    compassLegend:
      "0° = Lunar North (clockwise: 90° E, 180° S, 270° W). The panel harvests energy when its arrow faces the Sun.",
    pvToggleBtn: "⚡ Solar Array Simulator (GaAs 30%)",
    pvToggleTitle: "Show or hide interactive photovoltaic array net electrical power & energy calculator",
    pvAreaLabel: "Array Area:",
    pvAreaAria: "Solar panel surface area in square meters",
    pvAreaUnit: "m²",
    pvEffLabel: "Cell Eff.:",
    pvEffAria: "Solar cell efficiency percentage",
    pvEffNote: "GaAs 3J",
    pvPresetRover: "2 m² Rover",
    pvPresetLander: "10 m² Lander",
    pvPresetBase: "40 m² Base",
    pvNetElectricalUnit: "kWh electric",
    pvMeanPowerSuffix: "mean",
    pvNetBadgePrefix: "⚡ Net Array",
    quickmapBtn: "↗ LROC QuickMap",
    quickmapTitle: "Open coordinates on the official NASA LROC QuickMap domain (Intuitive Machines)",
    moontrekBtn: "↗ NASA Moon Trek",
    moontrekTitle: "Open in NASA Moon Trek (our browser openly unlocks horizon analysis restricted in Moon Trek)",
    popupBlockedAlert: "Please allow pop-ups in your browser to view the printable Technical Sheet.",
    verdictEnergyWinnerPrefix: "Peak solar harvesting (",
    verdictEnergyWinnerSuffix: "% ref.) and high useful irradiance.",
    verdictCommsWinnerPrefix: "Leader in direct Earth connectivity (",
    verdictCommsWinnerSuffix: "% continuous link).",
    verdictBalancedWinner: "Best overall balance across solar irradiance, DTE link, and thermal survival.",
    verdictLowDte: "Low viability: critical limitation in DTE link.",
    verdictLowSolar: "Low viability: critical limitation in solar illumination.",
    verdictSecondaryPrefix: "Secondary alternative #",
    categories: {
      apollo: "Apollo",
      clps: "Clps",
      artemis_candidate: "Artemis candidate",
      international: "International",
      commercial: "Commercial",
      science_target: "Science target",
      custom: "Custom",
    },
    profiles: {
      balanced: {
        name: "Balanced (Artemis)",
        shortDesc: "40% Solar Energy · 35% DTE · 25% Thermal Survival",
      },
      energy: {
        name: "Energy / ISRU Priority",
        shortDesc: "60% Solar Energy · 20% DTE · 20% Thermal Survival",
      },
      comms: {
        name: "Comms / DTE Priority",
        shortDesc: "20% Solar Energy · 60% DTE · 20% Thermal Survival",
      },
    },
    exportCsvHeaders: [
      "Site / Coordinate",
      "Type",
      "Latitude (deg)",
      "Longitude (deg)",
      "Mast Height h0 (m)",
      "Mission Start T0 (UTC)",
      "Window (days)",
      "Viability Score (0-100)",
      "Rank",
      "Verdict",
      "Optimal Panel Azimuth (deg)",
      "Optimal Cardinal Heading",
      "Fixed Vertical Panel Energy (kWh/m2)",
      "360 Tracking Panel Energy (kWh/m2)",
      "Horizontal Ground Panel Energy (kWh/m2)",
      "Solar Illumination (%)",
      "Direct-to-Earth Link DTE (%)",
      "Golden Window Sun+DTE (%)",
      "Golden Window (net hours)",
      "Max Continuous DTE Blackout (hours)",
      "Max Continuous Darkness (hours)",
      "Current Topographic Clearance (deg)",
      "Min Clearance (deg)",
      "Max Clearance (deg)",
      "Earth Distance (km)",
      "One-Way Latency OWLT (s)",
      "Round-Trip Latency RTT (s)",
      "FSPL S-Band 2.2GHz (dB)",
      "FSPL X-Band 8.4GHz (dB)",
      "FSPL Ka-Band 32GHz (dB)",
      "Solar Array Area (m2)",
      "Cell Efficiency (%)",
      "Net Fixed Optimal Electrical Output (kWh)",
      "Net Fixed Optimal Mean Power (W)",
      "Net 360 Tracking Electrical Output (kWh)",
      "Net Horizontal Electrical Output (kWh)",
    ],
    printReport: {
      title: "Lunar Landing Site Navigator — Mission Technical Sheet",
      printBtn: "🖨️ Print / Save as PDF",
      subtitle: "NASA Space Apps Challenge 2026 · Executive Lunar Site Comparison Report",
      sealLabel: "Scientific Seal:",
      ephemNote: "JPL DE421 Ephemeris · Airless Moon",
      issueDate: "Issue Date",
      missionStart: "Mission Start T₀ (UTC)",
      simWindow: "Simulation Window",
      daysUnit: "days",
      missionProfile: "Mission Profile",
      solarArraySpec: "PV Array Config",
      criteriaWeights: "Criteria Weighting",
      winnerHeading: "🏆 RECOMMENDED OPTIMAL SITE:",
      colSite: "Site / Candidate",
      colCoord: "Coord (Lat, Lon)",
      colMast: "Mast",
      colViability: "Viability",
      colOptAz: "Opt. Panel Azimuth",
      colFixedEnergy: "Fixed Energy",
      colTracking: "360° Tracking",
      colNetElectrical: "Net Output (Fixed / Track / Horiz)",
      colSunPct: "Sun (%)",
      colDtePct: "DTE (%)",
      colGolden: "Golden Window",
      colClearance: "Clearance",
      colRtt: "RTT Latency",
      colFspl: "FSPL (X / Ka)",
      footerLeft:
        "Data sources: NASA LOLA DEM (LRO PDS) · NASA/JPL Horizons Ephemeris API (coord@301) · IAU MOON_ME Frame",
      footerRight: "Generated by Lunar Landing Site Navigator — Flight Console",
    },
  },
};

export const TRANSLATIONS_ES: TranslationDictionary = {
  meta: {
    pageTitle: "Navegador de Sitios de Alunizaje Lunar",
  },
  languageToggle: {
    groupLabel: "Selector de idioma de la interfaz",
    esTitle: "Cambiar interfaz a Español",
    enTitle: "Switch interface to English",
  },
  header: {
    consoleAria: "Barra de control de misión NASA",
    insignia: "NASA SPACE APPS 2026",
    brandTitle: "Navegador de Sitios de Alunizaje Lunar",
    subtitleEdu: "Explorador Interactivo de la Luna · Luz Solar y Comunicación con la Tierra",
    subtitleEng: "Consola de Planificación Polar Sur",
    sealAriaLabel: "Sello de Verificación Científica",
    sealButtonTitle: "Ver resultados de validación frente al oráculo oficial NASA JPL Horizons",
    sealBadgeText: "Verificado JPL Horizons",
    sealModalTitle: "Precisión Verificada contra NASA JPL Horizons",
    sealOracle: "Oráculo",
    sealMaxElError: "Error Máx. Elevación",
    sealMaxAzError: "Error Máx. Acimut",
    sealRmsError: "Error RMS (El / Az)",
    sealKernelFrame: "Kernel / Marco Lunar",
    sealOpticalBending: "Desviación Óptica",
    sealSamplesSites: "Muestras / Sitios",
    samplesWord: "muestras",
    sitesWord: "sitios",
    modeGroupAria: "Selector de modo de interfaz",
    modeEdu: "Modo Educativo",
    modeEng: "Modo Ingeniero",
    toolbarAria: "Parámetros temporales de simulación de misión",
    epochLabel: "Época Misión T₀ (UTC):",
    epochTitle: "Elige libremente cualquier fecha y hora UTC futura (cobertura JPL DE421 hasta 2053)",
    utcBadgeTitle: "Tiempo Universal Coordinado (UTC Zulú)",
    quickWindowsLabel: "Ventanas Rápidas:",
    missionPresetsLabel: "Escenarios de Misión:",
    windowDurationLabel: "Ventana:",
    windowDurationTitle: "Duración de la ventana de simulación continua (1 a 365 días)",
    windowDaysUnit: "días",
    windowOption7: "7 días (1/4 ciclo lunar)",
    windowOption14: "14 días (Medio mes / día polar)",
    windowOption28: "28 días (Ciclo dracónico completo)",
    hardwareLabel: "ALTURA NAVE/ROVER (h₀):",
    presetsAria: "Accesos rápidos de ventana temporal",
    realTimeLabel: "Tiempo real",
    themeDarkLabel: "Modo Oscuro",
    themeLightLabel: "Modo Claro",
    switchToLightTitle: "Cambiar a Modo Claro",
    switchToDarkTitle: "Cambiar a Modo Oscuro",
  },
  presets: {
    now: {
      label: "⏱ Ahora (UTC)",
      eduLabel: "⏱ Ahora (UTC)",
      description: "Fecha y hora actual en Tiempo Universal Coordinado (UTC)",
    },
    "solstice-2026": {
      label: "☀ Solsticio Sur (21 Dic 2026)",
      eduLabel: "☀ Solsticio Sur (21 Dic 2026)",
      description: "Máxima iluminación solar y longitud mínima de sombras en el Polo Sur",
    },
    "winter-2027": {
      label: "🌑 Invierno Sur (21 Jun 2027)",
      eduLabel: "🌑 Invierno Sur (21 Jun 2027)",
      description: "Mínima elevación solar y sombras topográficas críticas para supervivencia",
    },
    "artemis-2027": {
      label: "🚀 Ventana Artemis (15 Sep 2027)",
      eduLabel: "🚀 Ventana Artemis (15 Sep 2027)",
      description: "Ventana candidata de lanzamiento y alunizaje polar Artemis",
    },
  },
  app: {
    mobileNavAria: "Navegación táctil móvil",
    tabVisual: "1. Globo 3D y Horizonte",
    tabCompare: "2. Comparador",
    tabTimeline: "3. Cronograma",
    visualCoreAria: "Núcleo visual 3D y horizonte lunar",
    visualTitleEdu: "Explorador visual lunar 3D y horizonte",
    visualTitleEng: "Explorador visual lunar 3D y horizonte",
    subviewTablistAria: "Selector de vista espacial",
    subviewGlobe: "Globo Lunar 3D",
    subviewDome: "Cúpula Horizonte 360°",
    subviewTerrain: "Terreno 3D LOLA",
    customCoordHeading: "Coordenada Lunar Personalizada",
    hardwareLabel: "Hardware:",
    customDescEdu:
      "Punto personalizado en la superficie lunar. Observa cómo cambia la luz solar y la vista a la Tierra según la latitud y altura del mástil.",
    customDescEngPrefix: "Evaluación topográfica MOON_ME con altura de instrumento",
    customDescEngHeight: "h₀ =",
    exploreQuickmap: "↗ Explorar en LROC QuickMap (quickmap.lroc.im-ldi.com)",
    viewMoontrek: "↗ Ver en NASA Moon Trek",
    openAccessNote: "★ Acceso abierto a iluminación/horizonte LOLA (restringido a cuentas JPL en Moon Trek)",
    customTimelineLabel: "Personalizado",
    noSiteSelectedTitle: "Ningún sitio lunar seleccionado",
    noSiteSelectedDesc:
      "Haz clic en cualquier punto de la Luna 3D o selecciona un sitio en el comparador para analizar su luz solar, horizonte local y enlace directo con la Tierra.",
    resizeSplitterTitle: "Arrastra para cambiar el ancho entre la Luna y el Comparador · Doble clic para restablecer",
    resizeHeightTitle: "Arrastra el borde para cambiar el alto del panel · Doble clic para restablecer",
    resizeCornerTitle: "Arrastra la esquina para cambiar ancho y alto · Doble clic para restablecer",
  },
  globe: {
    stageAria: "Globo Lunar 3D fotorrealista con imágenes reales NASA LROC WAC y Auto-LOD a Terreno 3D",
    noSiteSelectedPill: "Sin sitio seleccionado",
    focusLabel: "Foco:",
    fovLabel: "FOV",
    altitudeLabel: "Altitud:",
    zoomInBtn: "＋ Acercar",
    zoomInTitle: "Acercar cámara (en órbita baja transiciona automáticamente a Superficie LOLA 3D)",
    zoomOutBtn: "－ Alejar",
    zoomOutTitle: "Alejar cámara",
    focusSiteBtn: "Enfocar Sitio",
    focusSiteTitle: "Volar a órbita baja sobre el sitio seleccionado",
    focusSouthPoleBtn: "Polo Sur",
    globalViewBtn: "Vista Global",
    farSideBtn: "Cara Oculta",
    nearSideBtn: "Cara Visible",
    hideCardBtn: "Ocultar Ficha",
    showCardBtn: "Ficha Misión",
    lowOrbitHint: "Sigue acercando para descender automáticamente a la Superficie LOLA 3D",
    descendBtn: "⛰️ Descender a Superficie 3D Local (DEM LOLA 128×128) →",
    psrCabeusNote:
      "❄️ Región PSR (Sombra Permanente): trampa fría con hielo de agua confirmado por LCROSS (2009).",
    psrPolarPeakNote:
      "☀️ Pico Polar junto a cráteres PSR: luz solar rasante casi continua a pocos km de reservas de hielo.",
    historicMilestoneNote: "🚀 Hito Histórico de Exploración Lunar: trayectoria conectada en el globo 3D.",
    sunVectorLegend: "● Vector Sol",
    earthVectorLegend: "● Vector Tierra (DTE)",
    mosaicLegend: "● Mosaico Fotográfico NASA LROC WAC + LOLA 16-bit",
    eduHint: "Rueda para acercar · Haz clic en cualquier lugar de la Luna para abrirlo en el comparador",
    engHint: "Zoom con transición automática a Terreno 3D LOLA · Clic fija coordenadas MOON_ME",
  },
  terrain: {
    loading: "Cargando malla topográfica LOLA 3D (128×128)...",
    noSiteSelected: "Selecciona un sitio en el Globo 3D o en el comparador para explorar su terreno 3D LOLA",
    stageAria: "Superficie topográfica local LOLA 3D 128x128 con sombreado de relieve lunar",
    backToGlobe: "← Volver al Globo 3D",
    meshBadgePrefix: "Malla 3D HD: 128×128 (DEM LOLA",
    meshBadgeMid: ",",
    meshCellUnit: "m/celda)",
    zoomInBtn: "＋ Acercar",
    zoomInTitle: "Acercar cámara hacia la superficie local",
    zoomOutBtn: "－ Alejar",
    zoomOutTitle: "Alejar cámara (al alejar al máximo regresa al Globo Lunar 3D)",
    siteSelectorLabel: "🗺️ Sitio en Mapa LOLA 3D:",
    customSiteShort: "Sitio",
    showSiteTitlePrefix: "Mostrar",
    showSiteTitleSuffix: "en el Mapa LOLA 3D",
    activeMastLabel: "Mástil activo:",
    eduColorNote: "Zonas azules son cráteres profundos; zonas doradas son cimas iluminadas",
    engSourcePrefix: "Fuente:",
  },
  dome: {
    loading: "Cargando perfil de horizonte 360°...",
    noSiteSelected: "Selecciona un sitio en el Globo 3D o en el comparador para analizar su horizonte 360°",
    stageAria: "Cúpula panorámica de horizonte local 360 grados",
    svgAria: "Perfil de horizonte 360 grados con posiciones del Sol y la Tierra",
    siteSelectorLabel: "🔭 Sitio en Horizonte 360°:",
    topographicSourceLabel: "Fuente Topográfica:",
    sphericalFallback: "Esfera Analítica de Respaldo (R = 1737.4 km)",
    lolaPolarDem: "DEM Polar LOLA",
    exaggerationAria: "Selector de exageración vertical",
    verticalScaleLabel: "Escala vertical",
    cardinalN0: "N (0° · Cara Visible)",
    cardinalE90: "E (90°)",
    cardinalS180: "S (180° · Polo)",
    cardinalW270: "O (270°)",
    cardinalN360: "N (360°)",
    sunWord: "Sol",
    earthWord: "Tierra",
    horizonLineLegend: "Horizonte (relieve lunar)",
    windowStartLegend: "El Sol y la Tierra se ven en el instante de inicio de la ventana · La línea inferior es el horizonte",
    demElevLabel: "Elev. DEM:",
    mastLabel: "Mástil:",
    eduHint: "Si el Sol o la Tierra bajan de la silueta gris, las montañas bloquean la vista",
    engVacuumLabel: "Escala vertical",
    engBendingNote: "Vacío / 0° desviación óptica (R = 1737.4 km)",
  },
  polarMap: {
    stageAria: "Mapa estereográfico 2D del Polo Sur lunar",
    projectionLabel: "Proyección Estereográfica Polar Sur (80°S–90°S · MOON_ME)",
    towardEarth: "0° (Hacia Tierra)",
    farSide: "180° (Cara Oculta)",
    eduHint: "Pincha un marcador o cualquier punto del mapa para abrirlo en el comparador",
    engHint: "Haz clic en cualquier punto del mapa polar para evaluar coordenadas personalizadas",
  },
  countdown: {
    ariaLabel: "Cuentas atrás hasta el próximo Sunset y Earthset",
    windowExceed: "> ventana",
    nextSunsetEdu: "Próximo Ocaso (Sunset)",
    timeToSunsetEng: "Tiempo hasta Sunset",
    nextEarthsetEdu: "Próximo Ocaso Tierra",
    timeToEarthsetEng: "Tiempo hasta Earthset (DTE)",
    noCrossing: "Sin cruce en ventana",
  },
  timeline: {
    sectionAria: "Cronograma interactivo de elevación y deslizador temporal",
    titleEdu: "Cronograma Solar y DTE",
    titleEng: "Cronograma Sincronizado de Elevación Solar, Tierra DTE y Horizonte",
    yAxisEdu: "Altura sobre horizonte (°)",
    yAxisEng: "Grados respecto al horizonte",
    sunSeriesName: "☀ Margen Solar (e_☉ - γ_h)",
    earthSeriesName: "🜨 Visibilidad Tierra DTE (e_⊕ - γ_h)",
    localHorizonLabel: "Horizonte Local",
    goldenWindowBadge: "★ Ventana Dorada (Sol + DTE)",
    sunWord: "Sol",
    earthDteWord: "Tierra DTE",
    utcStartLabel: "Inicio UTC:",
    durationLabel: "Duración:",
    duration7: "7 días (1/4 mes lunar)",
    duration14: "14 días (Medio mes sinódico)",
    duration28: "28 días (Ciclo dracónico completo)",
    pauseBtn: "⏸ Pausar",
    playBtn: "▶ Animar",
    scrubberAria: "Deslizador temporal sincronizado",
    noSiteSelectedHint: "Selecciona un lugar en la Luna 3D o en el comparador para trazar su cronograma solar y DTE.",
    engPlannerSubtitle:
      "Planificador Operativo de Ventanas: cruza la elevación solar y terrestre frente al perfil de relieve LOLA para programar maniobras, supervivencia en sombra y descargas DTE.",
    sunLegendTitle: "☀ Elevación Solar (°)",
    sunLegendDesc: "Disponible para generación fotovoltaica cuando supera el horizonte.",
    earthLegendTitle: "🜨 Elevación Tierra DTE (°)",
    earthLegendDesc: "Enlace directo con Deep Space Network cuando supera el relieve.",
    horizonLegendTitle: "⛰ Perfil Horizonte LOLA (°)",
    horizonLegendDesc: "Cota mínima de obstrucción topográfica según el acimut en cada instante.",
    bandGoldenLabel: "Ventana Dorada (Sol + DTE)",
    bandSolarOnlyLabel: "Solo Energía / Sin DTE",
    bandEclipseLabel: "Eclipse / Modo Supervivencia",
    telemetryUtcLabel: "UTC",
    telemetrySunMarginLabel: "Margen Sol:",
    telemetryEarthMarginLabel: "Margen DTE:",
    telemetryHorizonShort: "Horizonte",
    stateGoldenBadge: "🟢 VENTANA DORADA",
    stateSolarOnlyBadge: "🟡 SOLO SOLAR",
    stateEclipseBadge: "🔴 ECLIPSE / BATERÍAS",
    telemetryLiveCursorHint: "Cursor",
    telemetryScrubberHint: "Selector",
    siteSelectorLabel: "📈 Punto en Cronograma:",
  },
  comparison: {
    panelAria: "Comparador lado a lado de sitios lunares",
    titleEdu: "Comparador de puntos de la superficie lunar (hasta 9 escenarios simultáneos)",
    titleEng: "Comparador de puntos de la superficie lunar (hasta 9 escenarios simultáneos)",
    eduWindowTitle: "Duración de la ventana de simulación continua",
    closeAllBtn: "Cerrar todos",
    closeAllTitle: "Cerrar todos los sitios abiertos en el comparador",
    profileLabel: "🎯 Perfil:",
    sortLabel: "Ordenar:",
    sortViability: "🏆 Viabilidad (Ranking)",
    sortSolar: "Mayor Iluminación Solar (%)",
    sortDte: "Mayor Visibilidad Tierra DTE (%)",
    sortGolden: "Mayor Ventana Dorada (Sol + DTE)",
    sortDefault: "Orden de selección",
    exportCsvBtn: "📊 Exportar CSV",
    exportCsvTitle: "Descargar informe completo en formato CSV (.csv)",
    exportPdfBtn: "📄 Ficha Técnica (PDF)",
    exportPdfTitle: "Generar Ficha Técnica ejecutiva para imprimir o guardar en PDF",
    catalogAria: "Catálogo de sitios curados",
    removeSiteChipTitlePrefix: "Haz clic para quitar",
    removeSiteChipTitleSuffix: "del comparador",
    addSiteChipTitlePrefix: "Añadir",
    latPlaceholder: "Lat °",
    latAria: "Latitud personalizada en grados",
    lonPlaceholder: "Lon °",
    lonAria: "Longitud personalizada en grados",
    evaluateCoordBtn: "Evaluar Coord.",
    emptyTitle: "No hay ningún sitio abierto en el comparador.",
    emptyEdu:
      "Pulsa cualquiera de los chips superiores (+) o haz clic en cualquier lugar de la Luna en el Globo 3D para abrirlo en el comparador.",
    emptyEng:
      "Pulsa cualquiera de los chips superiores (+), introduce coordenadas lunares o haz clic en el Globo Lunar 3D para añadirlo.",
    cardAriaPrefix: "Tarjeta comparativa para",
    optimalSiteBadge: "🏆 SITIO ÓPTIMO",
    viabilityRankLabel: "Viabilidad",
    ptsUnit: "pts",
    pillarSun: "☀ Sol:",
    pillarDte: "🜨 DTE:",
    pillarTherm: "🛡 Térm:",
    customSiteTitle: "Sitio personalizado",
    removeCardTitle: "Quitar este sitio del comparador",
    removeCardAriaPrefix: "Quitar",
    showingInTerrain: "👁️ Mostrando en Mapa LOLA 3D",
    activeInViewer: "🎯 Activo en Visor 3D",
    showInTerrainBtn: "🗺️ Mostrar en Mapa LOLA 3D",
    showInTerrainTitle: "Abrir este sitio directamente en la vista Mapa LOLA 3D",
    focusAndShowInTerrainTitle: "Marcar este sitio y abrirlo directamente en el Mapa LOLA 3D",
    mastHeightLabel: "📡 Altura Mástil / Placas:",
    mastHeightAriaPrefix: "Altura de mástil para",
    changeHeightTitlePrefix: "Cambiar altura del panel solar a",
    applyBtn: "Aplicar",
    applyTitle: "Aplicar nueva altura de mástil",
    heightRangeHint: "(0 a 100 m)",
    customHeightAriaPrefix: "Altura personalizada en metros para",
    heightPresetsAria: "Alturas oficiales de hardware",
    sunTitle: "☀ Sol",
    earthTitle: "🜨 Tierra",
    stateVisible: "VISIBLE",
    statePartial: "PARCIAL",
    stateOcculted: "OCULTO",
    clearanceLabel: "Margen:",
    sunPowerEdu: "Placas solares generando energía",
    sunShadowEdu: "Sombra topográfica: usando baterías",
    dteActiveBadge: "DTE ACTIVO",
    dteNoLinkBadge: "SIN ENLACE",
    dteAvailableEdu: "Enlace directo con la Tierra disponible",
    dteBlockedEdu: "Tierra oculta tras el horizonte",
    kpiSun: "☀ Luz Solar (Energía)",
    kpiDte: "🜨 Comunicación Directa con Tierra (DTE)",
    kpiGolden: "★ Ventana Dorada (Sol + DTE)",
    maxNightEdu: "Noche continua máx.:",
    daySingularUnit: "día",
    daysUnit: "días",
    maxDarknessEng: "Oscuridad Máx.:",
    meanSunElEng: "Elev. Solar Media:",
    horizonSpherical: "Esférico",
    horizonLolaDem: "DEM LOLA",
    dteHeaderTitle: "TELECOMUNICACIONES DTE Y ENLACE TIERRA (BANDA X / Ka)",
    clearanceTitlePrefix: "Margen angular sobre el terreno lunar:",
    badgeClear: "✓ DESPEJADO",
    badgeBlocked: "⚠ BLOQUEADO",
    zeroDteTitle: "Sin visión directa con la Tierra (DTE 0.0%)",
    zeroDteDesc:
      "Sin línea de visión directa: requiere satélite repetidor en órbita lunar (ej. Lunar Gateway, Queqiao, ESA Moonlight).",
    antennaPointingLabel: "Apuntamiento Antena (Az / El)",
    librationBoxLabel: "Caja de Libración Terrestre",
    librationBoxTitle: "Oscilación angular aparente de la Tierra desde la superficie lunar en la ventana",
    spanWord: "Rango",
    earthDistanceLabel: "Distancia Tierra",
    latencyLabel: "Latencia (OWLT / RTT)",
    owltRttTitlePrefix: "Ida simple (OWLT):",
    owltRttMid: "Ida y vuelta (RTT):",
    minMaxClearanceLabel: "Margen Mín / Máx",
    fsplTitle: "Pérdidas Espacio Libre (FSPL):",
    sBandChip: "Banda S (2.2G):",
    sBandTitle: "Banda S (2.2 GHz) - Enlace de comandos y telemetría",
    xBandChip: "Banda X (8.4G):",
    xBandTitle: "Banda X (8.4 GHz) - Enlace científico principal NASA DSN",
    kaBandChip: "Banda Ka (32G):",
    kaBandTitle: "Banda Ka (32.0 GHz) - Banda ancha y vídeo lunar HD",
    maxBlackoutLabel: "Apagón DTE continuo máx.:",
    continuous100: "0.0 h (100% continuo)",
    goldenWindowLabel: "Ventana Dorada (Sol + DTE):",
    netHoursUnit: "h netas",
    solarHeaderPrefix: "⚡ Irradiancia Solar AM0",
    optimalAzimuthBadgePrefix: "🎯 Acimut Óptimo:",
    optimalAzimuthTitle:
      "Acimut óptimo para panel vertical fijo: maximiza kWh/m² evitando el bloqueo de las montañas lunares",
    totalShadowTitle: "🌑 En sombra topográfica total (0 kWh/m²)",
    totalShadowDesc:
      "Las montañas bloquean al Sol durante toda la ventana. Los paneles solares no generan energía; se requieren baterías o energía nuclear (RTG).",
    fixedVerticalLabel: "📐 Vertical Fijo",
    starOptimal: "★ Óptimo",
    ofTracking: "% del tracking",
    advantageVsFlatLabel: "Ventaja frente a panel plano en suelo:",
    equivalentLabel: "Equivalente",
    infGroundZero: "∞ (suelo 0 kWh)",
    verticalTrackingLabel: "🔄 Vertical Seguimiento 360°",
    ceiling100: "100% (Techo)",
    horizontalGroundLabel: "⏹ Horizontal en Suelo",
    peakLabel: "Pico:",
    meanLabel: "Media:",
    manualOrientationLabel: "Orientación manual del panel fijo:",
    resetOptimalBtnPrefix: "Restablecer 🎯",
    resetOptimalTitle: "Volver al acimut óptimo calculado",
    adjustAzimuthAriaPrefix: "Ajustar acimut del panel fijo para",
    compassWLabel: "270° O",
    misalignmentPrefix: "⚠ Desalineación:",
    misalignmentVsOpt: "vs óptimo",
    compassAriaPrefix: "Brújula solar lunar: panel en",
    compassOptimalAt: "óptimo en",
    compassTotalShadowTitle: "Sombra topográfica total: las montañas bloquean los 360° de acimut",
    compassSectorShadowStart: "Sombra topográfica: las montañas bloquean al Sol entre",
    compassSectorShadowAnd: "y",
    compassTotalShadowWarning: "🌑 En sombra topográfica total",
    compassPillPanel: "📐 Panel:",
    compassPillOptimal: "🎯 Óptimo:",
    compassPillSun: "☀ Sol:",
    compassCaptures: " (capta)",
    compassRear: " (de espaldas)",
    compassPillEarth: "🜨 Tierra:",
    compassShadowPrefix: "⛰ Sombra (",
    compassShadowBlocked: "° bloqueados)",
    compassClickToPointPrefix: "Clic para orientar el panel a",
    compassLegend:
      "0° = Norte Lunar (sentido horario: 90° E, 180° S, 270° O). El panel genera energía cuando su flecha apunta al Sol.",
    pvToggleBtn: "⚡ Simular Array Fotovoltaico (GaAs 30%)",
    pvToggleTitle: "Mostrar u ocultar calculadora interactiva de producción eléctrica neta del array fotovoltaico",
    pvAreaLabel: "Superficie:",
    pvAreaAria: "Superficie del panel solar en metros cuadrados",
    pvAreaUnit: "m²",
    pvEffLabel: "Eficiencia:",
    pvEffAria: "Eficiencia de célula fotovoltaica en porcentaje",
    pvEffNote: "GaAs 3U",
    pvPresetRover: "2 m² Rover",
    pvPresetLander: "10 m² Lander",
    pvPresetBase: "40 m² Base",
    pvNetElectricalUnit: "kWh eléctricos",
    pvMeanPowerSuffix: "medios",
    pvNetBadgePrefix: "⚡ Array Neto",
    quickmapBtn: "↗ LROC QuickMap",
    quickmapTitle: "Abrir coordenadas en el dominio oficial NASA LROC QuickMap (Intuitive Machines)",
    moontrekBtn: "↗ NASA Moon Trek",
    moontrekTitle: "Abrir en NASA Moon Trek (nuestro navegador abre análisis restringidos en Moon Trek)",
    popupBlockedAlert: "Por favor permite las ventanas emergentes en tu navegador para ver la Ficha Técnica imprimible.",
    verdictEnergyWinnerPrefix: "Máxima captación fotovoltaica (",
    verdictEnergyWinnerSuffix: "% ref.) y alta irradiancia útil.",
    verdictCommsWinnerPrefix: "Líder en enlace directo con la Tierra (",
    verdictCommsWinnerSuffix: "% de conexión continua).",
    verdictBalancedWinner: "Mejor equilibrio global entre energía solar, enlace DTE y supervivencia térmica.",
    verdictLowDte: "Baja viabilidad: limitación crítica en comunicación DTE.",
    verdictLowSolar: "Baja viabilidad: limitación crítica en iluminación solar.",
    verdictSecondaryPrefix: "Alternativa secundaria #",
    categories: {
      apollo: "Apollo",
      clps: "Clps",
      artemis_candidate: "Candidato artemis",
      international: "Internacional",
      commercial: "Comercial",
      science_target: "Objetivo científico",
      custom: "Personalizado",
    },
    profiles: {
      balanced: {
        name: "Equilibrado (Artemis)",
        shortDesc: "40% Energía Solar · 35% Comunicaciones DTE · 25% Supervivencia Térmica",
      },
      energy: {
        name: "Prioridad Energía Solar / ISRU",
        shortDesc: "60% Energía Solar · 20% Comunicaciones DTE · 20% Supervivencia Térmica",
      },
      comms: {
        name: "Prioridad Comunicaciones DTE",
        shortDesc: "20% Energía Solar · 60% Comunicaciones DTE · 20% Supervivencia Térmica",
      },
    },
    exportCsvHeaders: [
      "Sitio / Coordenada",
      "Tipo",
      "Latitud (deg)",
      "Longitud (deg)",
      "Altura Mástil h0 (m)",
      "Inicio Misión T0 (UTC)",
      "Ventana (días)",
      "Puntuación Viabilidad (0-100)",
      "Posición Ranking",
      "Veredicto",
      "Acimut Óptimo Panel (deg)",
      "Rumbo Cardinal Óptimo",
      "Energía Panel Vertical Fijo (kWh/m2)",
      "Energía Panel Tracking 360 (kWh/m2)",
      "Energía Panel Horizontal Suelo (kWh/m2)",
      "Iluminación Solar (%)",
      "Enlace Directo Tierra DTE (%)",
      "Ventana Dorada Sol+DTE (%)",
      "Ventana Dorada (h netas)",
      "Apagón DTE Máximo (horas)",
      "Oscuridad Continua Máxima (horas)",
      "Margen Topográfico Actual (deg)",
      "Margen Mínimo (deg)",
      "Margen Máximo (deg)",
      "Distancia Tierra (km)",
      "Latencia Ida OWLT (s)",
      "Latencia Ida y Vuelta RTT (s)",
      "FSPL Banda S 2.2GHz (dB)",
      "FSPL Banda X 8.4GHz (dB)",
      "FSPL Banda Ka 32GHz (dB)",
      "Superficie Array Solar (m2)",
      "Eficiencia Célula (%)",
      "Producción Eléctrica Neta Fija Óptima (kWh)",
      "Potencia Media Neta Fija Óptima (W)",
      "Producción Eléctrica Neta Tracking 360 (kWh)",
      "Producción Eléctrica Neta Horizontal (kWh)",
    ],
    printReport: {
      title: "Lunar Landing Site Navigator — Ficha Técnica de Misión",
      printBtn: "🖨️ Imprimir / Guardar en PDF",
      subtitle: "NASA Space Apps Challenge 2026 · Informe Ejecutivo Comparativo de Sitios Lunares",
      sealLabel: "Sello Científico:",
      ephemNote: "Efemérides JPL DE421 · Luna sin atmósfera",
      issueDate: "Fecha de Emisión",
      missionStart: "Inicio Misión T₀ (UTC)",
      simWindow: "Ventana de Simulación",
      daysUnit: "días",
      missionProfile: "Perfil de Misión",
      solarArraySpec: "Array Fotovoltaico",
      criteriaWeights: "Ponderación Criterios",
      winnerHeading: "🏆 SITIO ÓPTIMO RECOMENDADO:",
      colSite: "Sitio / Candidato",
      colCoord: "Coord (Lat, Lon)",
      colMast: "Mástil",
      colViability: "Viabilidad",
      colOptAz: "Acimut Óptimo",
      colFixedEnergy: "Energía Fija",
      colTracking: "Tracking 360°",
      colNetElectrical: "Prod. Eléctrica Neta (Fija / Track / Horiz)",
      colSunPct: "Sol (%)",
      colDtePct: "DTE (%)",
      colGolden: "Ventana Dorada",
      colClearance: "Margen",
      colRtt: "Latencia RTT",
      colFspl: "FSPL (X / Ka)",
      footerLeft:
        "Fuentes de datos: NASA LOLA DEM (LRO PDS) · NASA/JPL Horizons Ephemeris API (coord@301) · Marco IAU MOON_ME",
      footerRight: "Generado por Lunar Landing Site Navigator — Consola de Vuelo",
    },
  },
};

export const TRANSLATIONS: Record<Language, TranslationDictionary> = {
  en: TRANSLATIONS_EN,
  es: TRANSLATIONS_ES,
};

export const SITE_TRANSLATIONS: Record<Language, Record<string, LocalizedSiteCopy>> = {
  en: {
    "apollo-11": {
      name: "Apollo 11 - Tranquility Base",
      mission: "Apollo 11 (NASA), 1969-07-20",
      description_tech:
        "Mare Tranquillitatis. Near the mean sub-Earth point: Earth stays high (~60-75 deg elevation depending on libration) and continuously visible; ~14.77 d synodic day/night cycle.",
      description_edu:
        "The first crewed Moon landing. From here, Earth hangs almost motionless high in the sky.",
    },
    "apollo-17": {
      name: "Apollo 17 - Taurus-Littrow",
      mission: "Apollo 17 (NASA), 1972-12-11",
      description_tech:
        "Taurus-Littrow Valley flanked by North and South Massif. Mid-latitude control case: Sun reaches ~70 deg elevation with continuous DTE.",
      description_edu:
        "The final Apollo mission. A mountain-ringed valley where the Sun climbs much higher than at the poles.",
    },
    "shackleton-rim": {
      name: "Shackleton Rim (Peak near Shackleton)",
      mission: "Artemis III Candidate Region / CSA Utility Rover ops",
      description_tech:
        "Shackleton crater rim (D ~21 km, depth ~4.2 km, PSR interior). Rim ridges illuminated > 80% of the year; grazing Sun (|e| < ~2 deg); DTE modulated every 27.21 d by latitudinal libration.",
      description_edu:
        "The rim of a crater near the south pole. Here the Sun almost never sets, skimming the horizon like an eternal sunset.",
    },
    "malapert-massif": {
      name: "Malapert Massif",
      mission: "Artemis III Candidate Region / Relay & DTE Prime Site",
      description_tech:
        "Massif ~4.6-5.0 km tall facing the Earthward nearside (lon ~2.7 E): offers nearly uninterrupted DTE visibility and broad illumination windows on its ridge.",
      description_edu:
        "An enormous mountain near the south pole facing Earth: ideal for talking directly with home without relay satellites.",
    },
    "cabeus-crater": {
      name: "Cabeus Crater (LCROSS impact site)",
      mission: "LCROSS (NASA), impact 2009-10-09",
      description_tech:
        "Depressed interior (-3.85 km) ringed by +1 to +2 km walls: permanently shadowed region (PSR) with water ice confirmed by LCROSS. Extreme case of solar and DTE topographic blockage.",
      description_edu:
        "A crater so deep its floor never sees the Sun. NASA discovered water ice here in 2009.",
    },
    "mons-mouton-leibnitz-beta": {
      name: "Mons Mouton (Leibnitz Beta Plateau) - IM-2 Athena",
      mission: "CLPS IM-2 (Intuitive Machines, Athena), 2025-03-06",
      description_tech:
        "Elevated plateau (+5321 m above R=1737.4 km) on former Leibnitz Beta. Real CLPS south-polar landing site; nearly 360-deg unobstructed horizon with excellent DTE.",
      description_edu:
        "A high plateau near the south pole where the commercial lander Athena touched down in 2025.",
    },
    "nobile-rim-1": {
      name: "Nobile Rim 1",
      mission: "Artemis III Candidate Region / Former VIPER Target",
      description_tech:
        "Elevated rim of Nobile crater (~85.4 S, 35.0 E). Combines access to nearby cold traps with well-illuminated ridges and favorable DTE visibility.",
      description_edu:
        "The rim of another large south polar crater studied by NASA and CSA for nearby ice exploration.",
    },
    "chandrayaan-3": {
      name: "Chandrayaan-3 - Shiv Shakti Point",
      mission: "Chandrayaan-3 Vikram & Pragyan (ISRO), 2023-08-23",
      description_tech:
        "High southern latitude (-69.37 deg) outside the extreme polar zone: ~14-day day/night cycle with peak solar elevation ~21 deg and continuous DTE (Earth elevation ~18-25 deg).",
      description_edu:
        "The site where India landed its Pragyan rover in 2023 in the southern lunar highlands.",
    },
    "change-4": {
      name: "Chang'e 4 - Statio Tianhe (Von Karman)",
      mission: "Chang'e 4 & Yutu-2 (CNSA), 2019-01-03",
      description_tech:
        "South Pole-Aitken basin on the lunar farside (lon 177.6 E): Earth elevation < -35 deg at all times (DTE = 0%, requires Queqiao relay satellite). Mandatory negative control case for DTE.",
      description_edu:
        "The first spacecraft on the Moon's far side. Earth is never visible from here, so it relies on a relay satellite to communicate.",
    },
  },
  es: {
    "apollo-11": {
      name: "Apollo 11 - Base Tranquilidad",
      mission: "Apollo 11 (NASA), 1969-07-20",
      description_tech:
        "Mare Tranquillitatis. Cerca del punto sub-terrestre medio: la Tierra permanece alta (~60–75° de elevación según libración) y siempre visible; ciclo día/noche sinódico de ~14.77 días.",
      description_edu:
        "El primer alunizaje tripulado de la historia. Desde aquí, la Tierra cuelga casi inmóvil en lo alto del cielo.",
    },
    "apollo-17": {
      name: "Apollo 17 - Taurus-Littrow",
      mission: "Apollo 17 (NASA), 1972-12-11",
      description_tech:
        "Valle de Taurus-Littrow flanqueado por los macizos Norte y Sur. Caso de control de latitud media: el Sol alcanza ~70° de elevación con enlace DTE continuo.",
      description_edu:
        "La última misión Apollo. Un valle rodeado de montañas donde el Sol sube mucho más alto que en los polos.",
    },
    "shackleton-rim": {
      name: "Borde de Shackleton (Pico cercano a Shackleton)",
      mission: "Región candidata Artemis III / Ops. CSA Utility Rover",
      description_tech:
        "Borde del cráter Shackleton (D ~21 km, profundidad ~4.2 km, interior PSR). Crestas iluminadas > 80% del año; Sol rasante (|e| < ~2°); enlace DTE modulado cada 27.21 d por libración latitudinal.",
      description_edu:
        "El borde de un cráter junto al polo sur. Aquí el Sol casi nunca se pone, rozando el horizonte como un atardecer eterno.",
    },
    "malapert-massif": {
      name: "Macizo Malapert",
      mission: "Región candidata Artemis III / Sitio clave DTE y Repetidor",
      description_tech:
        "Macizo de ~4.6–5.0 km de altitud orientado hacia la cara visible (lon ~2.7° E): ofrece visibilidad DTE casi ininterrumpida y amplias ventanas de iluminación en su cresta.",
      description_edu:
        "Una montaña enorme cerca del polo sur que 'mira' hacia la Tierra: ideal para comunicarse directamente con casa sin satélites repetidores.",
    },
    "cabeus-crater": {
      name: "Cráter Cabeus (Zona impacto LCROSS)",
      mission: "LCROSS (NASA), impacto 2009-10-09",
      description_tech:
        "Interior deprimido (-3.85 km) rodeado de paredes de +1 a +2 km: región en sombra permanente (PSR) con hielo de agua confirmado por LCROSS. Caso extremo de bloqueo topográfico solar y DTE.",
      description_edu:
        "Un cráter tan profundo que su fondo jamás ve la luz del Sol. La NASA confirmó la presencia de hielo de agua aquí en 2009.",
    },
    "mons-mouton-leibnitz-beta": {
      name: "Mons Mouton (Meseta Leibnitz Beta) - IM-2 Athena",
      mission: "CLPS IM-2 (Intuitive Machines, Athena), 2025-03-06",
      description_tech:
        "Meseta elevada (+5321 m sobre R=1737.4 km) en antigua Leibnitz Beta. Sitio real CLPS en el polo sur; horizonte casi despejado en 360° con excelente enlace DTE.",
      description_edu:
        "Una meseta muy alta cerca del polo sur donde el módulo comercial Athena tocó suelo en 2025.",
    },
    "nobile-rim-1": {
      name: "Borde de Nobile 1 (Nobile Rim 1)",
      mission: "Región candidata Artemis III / Antiguo objetivo VIPER",
      description_tech:
        "Borde elevado del cráter Nobile (~85.4° S, 35.0° E). Combina acceso a trampas frías cercanas con crestas bien iluminadas y visibilidad DTE favorable.",
      description_edu:
        "El borde de otro gran cráter del polo sur estudiado por NASA y la CSA para explorar el hielo cercano.",
    },
    "chandrayaan-3": {
      name: "Chandrayaan-3 - Punto Shiv Shakti",
      mission: "Chandrayaan-3 Vikram y Pragyan (ISRO), 2023-08-23",
      description_tech:
        "Latitud sur elevada (-69.37°) fuera de la zona polar extrema: ciclo día/noche de ~14 días con pico solar de ~21° y DTE continuo (elevación de la Tierra ~18–25°).",
      description_edu:
        "El lugar donde la India posó su rover Pragyan en 2023 en las tierras altas del sur lunar.",
    },
    "change-4": {
      name: "Chang'e 4 - Statio Tianhe (Von Kármán)",
      mission: "Chang'e 4 y Yutu-2 (CNSA), 2019-01-03",
      description_tech:
        "Cuenca Aitken-Polo Sur en la cara oculta (lon 177.6° E): elevación de la Tierra < -35° en todo momento (DTE = 0%, requiere satélite relé Queqiao). Caso de control negativo obligatorio para DTE.",
      description_edu:
        "La primera nave en posarse en la cara oculta de la Luna. Desde aquí nunca se ve la Tierra, así que usa un satélite repetidor para comunicarse.",
    },
  },
};

export const HARDWARE_TRANSLATIONS: Record<Language, Record<string, LocalizedHardwareCopy>> = {
  en: {
    "csa-leap-payload": {
      name: "CSA LEAP Micro-Rover / Surface Payload (0.5 m)",
      agency: "CSA (Canadian Space Agency)",
      description_tech:
        "Typical camera/panel height on microrovers and surface payloads in the CSA Lunar Exploration Acceleration Program (LEAP).",
      description_edu:
        "A low-profile Canadian mini-rover (0.5 m): any nearby rock or ridge can cast shadows across its solar panels.",
    },
    "csa-utility-rover": {
      name: "CSA Canadian Utility Rover Mast (1.5 m)",
      agency: "CSA (Canadian Space Agency)",
      description_tech:
        "Navigation mast, DTE antenna, and solar array height on the Canadian Space Agency (CSA) Utility Rover.",
      description_edu:
        "Canada's utility rover (1.5 m tall), designed to assist astronauts and carry equipment at the lunar south pole.",
    },
    "artemis-eva-mast": {
      name: "Artemis Astronaut EVA / Standard Tripod (2.0 m)",
      agency: "NASA / Artemis",
      description_tech:
        "Standard reference height (2.0 m) for an Artemis EVA astronaut visor or deployable communications/solar tripod.",
      description_edu:
        "The eye height of an astronaut or a portable tripod antenna placed on the lunar surface (2.0 m).",
    },
    "artemis-ltv": {
      name: "Artemis Lunar Terrain Vehicle / Rover High-Gain (2.2 m)",
      agency: "NASA / Commercial LTV",
      description_tech:
        "High-gain X/Ka-band antenna and elevated solar array mounted on the Lunar Terrain Vehicle (LTV).",
      description_edu:
        "The astronauts' lunar exploration vehicle with its communications mast raised to 2.2 meters.",
    },
    "clps-lander-mast": {
      name: "NASA CLPS Lander Top Deck / Solar Array (3.5 m)",
      agency: "NASA CLPS / Commercial",
      description_tech:
        "Upper deck of a commercial CLPS lander (e.g. Nova-C Athena / Griffin, ~3.5 m), maximizing visibility over local terrain undulations.",
      description_edu:
        "The top deck of a commercial lunar lander (3.5 m), ideal for seeing above nearby rocks and low hills.",
    },
  },
  es: {
    "csa-leap-payload": {
      name: "Microrover / Carga CSA LEAP (0.5 m)",
      agency: "CSA (Agencia Espacial Canadiense)",
      description_tech:
        "Altura típica de cámara y paneles en microrovers y cargas científicas del programa canadiense CSA LEAP.",
      description_edu:
        "Un mini-rover canadiense de perfil bajo (medio metro): cualquier roca o loma cercana puede taparle el Sol.",
    },
    "csa-utility-rover": {
      name: "Mástil CSA Canadian Utility Rover (1.5 m)",
      agency: "CSA (Agencia Espacial Canadiense)",
      description_tech:
        "Mástil de navegación, antena DTE y paneles solares del Rover Utilitario de la Agencia Espacial Canadiense (CSA).",
      description_edu:
        "El rover utilitario de Canadá (1.5 metros de altura), diseñado para asistir a los astronautas en el polo sur lunar.",
    },
    "artemis-eva-mast": {
      name: "Astronauta Artemis EVA / Trípode Estándar (2.0 m)",
      agency: "NASA / Artemis",
      description_tech:
        "Altura estándar de referencia (2.0 m) para el visor de un astronauta EVA Artemis o trípode desplegable de comunicaciones/energía.",
      description_edu:
        "La altura de los ojos de un astronauta o una antena portátil desplegada sobre el regolito lunar (2 metros).",
    },
    "artemis-ltv": {
      name: "Vehículo Lunar Artemis LTV / Alta Ganancia (2.2 m)",
      agency: "NASA / LTV Comercial",
      description_tech:
        "Antena de alta ganancia en banda X/Ka y panel solar elevado montados sobre el Lunar Terrain Vehicle (LTV).",
      description_edu:
        "El vehículo todoterreno lunar de los astronautas con su antena de comunicaciones elevada a 2.2 metros.",
    },
    "clps-lander-mast": {
      name: "Cubierta Superior Lander NASA CLPS (3.5 m)",
      agency: "NASA CLPS / Comercial",
      description_tech:
        "Cubierta superior de un aterrizador comercial CLPS (ej. Nova-C Athena / Griffin, ~3.5 m), maximizando visibilidad sobre ondulaciones locales.",
      description_edu:
        "La parte más alta de un módulo lunar comercial (3.5 metros), ideal para ver por encima de rocas y colinas cercanas.",
    },
  },
};

export function toSentenceCase(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
}

export function getLocalizedSiteCopy(site: CuratedSite, lang: Language): LocalizedSiteCopy {
  const entry = SITE_TRANSLATIONS[lang][site.id];
  if (entry) {
    return {
      ...entry,
      name: toSentenceCase(entry.name),
    };
  }
  return {
    name: toSentenceCase(site.name),
    mission: site.mission,
    description_tech: site.description_tech,
    description_edu: site.description_edu,
  };
}

export function getShortSiteName(site: CuratedSite, lang: Language): string {
  const copy = getLocalizedSiteCopy(site, lang);
  return copy.name.split("-")[0]?.split("(")[0]?.trim() ?? copy.name;
}

export function getLocalizedHardwareCopy(hw: HardwareProfile, lang: Language): LocalizedHardwareCopy {
  const entry = HARDWARE_TRANSLATIONS[lang][hw.id];
  if (entry) return entry;
  return {
    name: hw.name,
    agency: hw.agency,
    description_tech: hw.description_tech,
    description_edu: hw.description_edu,
  };
}
