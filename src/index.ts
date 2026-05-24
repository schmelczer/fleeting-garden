import GameLoop from './game-loop/game-loop';

import './index.scss';

import { initAnalytics, trackExport, trackStart, trackVibeChange } from './analytics';
import { preloadPianoSamples } from './audio/piano-samples';
import { AudioControl } from './page/audio-control';
import { CollapsiblePanelAnimator } from './page/collapsible-panel-animator';
import { ConfigPane } from './page/config-pane';
import { EraserSizeControl } from './page/eraser-size-control';
import { ErrorPresenter } from './page/error-presenter';
import { FullScreenHandler } from './page/full-screen-handler';
import { MenuHider } from './page/menu-hider';
import { MirrorSegmentControl } from './page/mirror-segment-control';
import { PaletteControl } from './page/palette-control';
import { SplashScreen } from './page/splash-screen';
import { VibeNavigator } from './page/vibe-navigator';
import { getMaxSupportedAgentCount } from './pipelines/agents/agent-limits';
import { activeVibe } from './settings';
import { DeltaTimeCalculator } from './utils/delta-time-calculator';
import { queryRequiredElement } from './utils/dom';
import { ErrorHandler, Severity } from './utils/error-handler';
import { initializeGpu } from './utils/graphics/initialize-gpu';

const main = async () => {
  let hasRuntimeErrorListener = false;
  try {
    initAnalytics();

    let shouldStop = false;
    let hasStarted = false;
    let game: GameLoop | null = null;
    let configPane: ConfigPane | null = null;
    const getGame = () => game;
    const destroyCurrentGame = async () => {
      const currentGame = game;
      if (!currentGame) {
        return;
      }

      game = null;
      await currentGame.destroy();
    };

    const errorPresenter = new ErrorPresenter(
      queryRequiredElement('.errors-container', HTMLElement)
    );
    ErrorHandler.addOnErrorListener((error) => {
      errorPresenter.render(error);
      if (error.severity === Severity.ERROR) {
        document.body.classList.remove('is-loading');
        void destroyCurrentGame();
        shouldStop = true;
      }
    });
    hasRuntimeErrorListener = true;

    const aside = queryRequiredElement('aside', HTMLElement);
    const canvas = queryRequiredElement('canvas', HTMLCanvasElement);
    const toolbarRow = queryRequiredElement('.toolbar-row', HTMLElement);
    const eraserPreview = queryRequiredElement('.eraser-preview', HTMLDivElement);
    const grainOverlay = queryRequiredElement('.garden-grain', HTMLDivElement);
    const promptElement = queryRequiredElement('.garden-prompt', HTMLDivElement);
    const exportStatus = queryRequiredElement('.export-status', HTMLSpanElement);
    const settingsButton = queryRequiredElement(
      '[data-control="settings"]',
      HTMLButtonElement
    );
    const restartButton = queryRequiredElement(
      '[data-control="restart"]',
      HTMLButtonElement
    );
    const infoButton = queryRequiredElement('[data-control="info"]', HTMLButtonElement);
    const infoCloseButton = queryRequiredElement(
      '[data-control="info-close"]',
      HTMLButtonElement
    );
    const infoElement = queryRequiredElement('.info-page', HTMLElement);
    const fullScreenButton = queryRequiredElement(
      '[data-control="full-screen"]',
      HTMLButtonElement
    );
    const export4kButton = queryRequiredElement(
      '[data-control="export"]',
      HTMLButtonElement
    );

    const splash = new SplashScreen();
    let eraserSizeControl: EraserSizeControl | null = null;
    const paletteControl = new PaletteControl({
      getGame,
      onChange: () => configPane?.refresh(),
      onModeChange: (isEraserActive) => eraserSizeControl?.setActive(isEraserActive),
    });
    eraserSizeControl = new EraserSizeControl({
      getGame,
      onActivate: () => paletteControl.setEraserActive(true),
      onChange: () => configPane?.refresh(),
    });
    const mirrorSegmentControl = new MirrorSegmentControl({
      onChange: () => {
        paletteControl.setEraserActive(false);
        configPane?.refresh();
      },
    });
    const audioControl = new AudioControl({
      getGame,
      hasStarted: () => hasStarted,
      startButton: splash.startButton,
    });

    const syncRuntimeUi = () => {
      eraserSizeControl?.render();
      eraserSizeControl?.setActive(paletteControl.isEraserActive);
      mirrorSegmentControl.render();
      paletteControl.render();
    };

    const infoPageHandler = new CollapsiblePanelAnimator(infoButton, infoElement, aside);
    infoCloseButton.addEventListener('click', () => infoPageHandler.close());
    new MenuHider(
      aside,
      () =>
        FullScreenHandler.isInFullScreenMode() &&
        !configPane?.isOpen &&
        !infoPageHandler.isOpen
    );
    new FullScreenHandler(fullScreenButton, document.documentElement);

    new VibeNavigator({
      onChange: ({ vibeId, vibeName, source, userGesture }) => {
        trackVibeChange({ vibeId, vibeName, source });
        game?.onVibeChanged();
        syncRuntimeUi();
        configPane?.refresh();
        game?.playVibeChangeAudio(userGesture);
      },
    });

    restartButton.addEventListener('click', () => void destroyCurrentGame());

    export4kButton.addEventListener('click', async () => {
      const currentGame = game;
      if (!currentGame || export4kButton.disabled) {
        return;
      }

      export4kButton.disabled = true;
      try {
        await currentGame.exportSnapshot();
        trackExport({ vibeId: activeVibe.id });
      } catch (error) {
        ErrorHandler.addException(error, { severity: Severity.WARNING });
      } finally {
        export4kButton.disabled = false;
      }
    });

    // Samples load before Start is enabled so the first audible piano note
    // always uses the sampler. The Start tap still unlocks the AudioContext.
    splash.showLoadingBar();
    const fontsReady = document.fonts.ready.catch((error) => {
      ErrorHandler.addException(error, {
        fallbackMessage: 'Could not load fonts.',
        severity: Severity.WARNING,
      });
    });
    const gpuPromise = initializeGpu();

    const preloadPromise = preloadPianoSamples(({ loadedCount, totalCount }) => {
      const ratio = totalCount > 0 ? loadedCount / totalCount : 0;
      splash.setLoadingStage(
        `Loading piano samples ${loadedCount}/${totalCount}…`,
        ratio
      );
    }).then(
      () => {
        splash.setLoadingStage('Ready', 1);
      },
      (error: unknown) => {
        splash.setLoadingStage('Piano unavailable', 1);
        ErrorHandler.addException(error, {
          fallbackMessage: 'Could not preload piano samples.',
          severity: Severity.WARNING,
        });
      }
    );

    const gpu = await gpuPromise;
    const gpuNavigator = navigator.gpu;
    if (!gpuNavigator) {
      throw new Error('WebGPU is no longer available after initialization.');
    }
    const canvasFormat = gpuNavigator.getPreferredCanvasFormat();
    configPane = new ConfigPane({
      maxSupportedAgentCount: getMaxSupportedAgentCount(gpu),
      settingsButton,
      onOpen: () => infoPageHandler.close(),
      onConfigChange: () => {
        game?.onVibeChanged();
        syncRuntimeUi();
      },
      onRuntimeChange: syncRuntimeUi,
    });
    infoPageHandler.onOpen = configPane.close.bind(configPane);
    await fontsReady;
    await preloadPromise;
    splash.hideLoadingBar();

    const deltaTimeCalculator = new DeltaTimeCalculator();

    let isFirstStart = true;
    while (!shouldStop) {
      const loop = new GameLoop(canvas, gpu, canvasFormat, deltaTimeCalculator, {
        toolbar: toolbarRow,
        prompt: promptElement,
        eraserPreview,
        grainOverlay,
        exportStatus,
      });
      game = loop;
      syncRuntimeUi();
      audioControl.render();

      if (isFirstStart) {
        isFirstStart = false;

        // Splash is in the DOM by default; enable the button now that the
        // audio system (GameLoop) is constructed and ready to be unlocked.
        await splash.awaitStart(() => {
          hasStarted = true;
          game?.startAudio(true);
          trackStart();
        });

        requestAnimationFrame(() =>
          requestAnimationFrame(() => document.body.classList.remove('is-loading'))
        );
      }
      loop.attachPointerInput();
      await loop.start();
      if (game === loop) {
        game = null;
      }
    }
  } catch (e) {
    document.body.classList.remove('is-loading');
    if (hasRuntimeErrorListener) {
      ErrorHandler.addException(e);
    } else {
      ErrorPresenter.renderStartup(e);
      ErrorHandler.addException(e);
    }
  }
};

main();
