import '../assets/icons/info.svg';
import GameLoop from './game-loop/game-loop';
import { GameRules } from './game-loop/game-rules';
import './index.scss';
import { CollapsiblePanelAnimator } from './page/collapsible-panel-animator';
import { FullScreenHandler } from './page/full-screen-handler';
import { MenuHider } from './page/menu-hider';
import { setUpSettingsPage } from './page/set-up-settings-page';
import { SettingsSlider } from './page/settings-slider';
import { resetSettings } from './settings';
import { applyArrayPlugins } from './utils/array';
import { DeltaTimeCalculator } from './utils/delta-time-calculator';
import { ErrorHandler, Severity } from './utils/error-handler';
import { formatNumber } from './utils/format-number';
import { initializeGpu } from './utils/graphics/initialize-gpu';

declare global {
  interface Array<T> {
    x: T;
    y: T;
  }

  interface ReadonlyArray<T> {
    x: T;
    y: T;
  }

  interface Float32Array {
    x: number;
    y: number;
  }
}

const elements = {
  aside: document.querySelector('aside') as HTMLDivElement,
  infoButton: document.querySelector('button.info') as HTMLButtonElement,
  infoElement: document.querySelector('.info-page') as HTMLDivElement,
  settingsPage: document.querySelector('.settings-page') as HTMLDivElement,
  settingsContent: document.querySelector('.settings-content') as HTMLDivElement,
  applyDefaults: document.querySelector('#apply-defaults') as HTMLButtonElement,
  minimizeFullScreenButton: document.querySelector(
    'button.minimize-full-screen'
  ) as HTMLButtonElement,
  maximizeFullScreenButton: document.querySelector(
    'button.maximize-full-screen'
  ) as HTMLButtonElement,
  settingsButton: document.querySelector('button.settings') as HTMLButtonElement,
  restartButton: document.querySelector('button.restart') as HTMLButtonElement,
  canvas: document.querySelector('canvas') as HTMLCanvasElement,
  canvasContainer: document.querySelector('main.canvas-container') as HTMLCanvasElement,
  errorContainer: document.querySelector('.errors-container') as HTMLDivElement,
  counters: document.querySelector('.counters > pre') as HTMLPreElement,
};

const main = async () => {
  try {
    let shouldStop = false;
    let game: GameLoop | null = null;

    applyArrayPlugins();

    ErrorHandler.addOnErrorListener((error, _metadata) => {
      elements.errorContainer.innerHTML += `
        <pre class="${error.severity}">${error.message}</div>
      `;
      game?.destroy();
      shouldStop = true;
    });

    const infoPageHandler = new CollapsiblePanelAnimator(
      elements.infoButton,
      elements.infoElement,
      elements.aside
    );
    const settingsPageHandler = new CollapsiblePanelAnimator(
      elements.settingsButton,
      elements.settingsPage,
      elements.aside
    );
    settingsPageHandler.onOpen = infoPageHandler.close.bind(infoPageHandler);
    infoPageHandler.onOpen = settingsPageHandler.close.bind(settingsPageHandler);
    infoPageHandler.open();

    new MenuHider(
      elements.aside,
      () =>
        FullScreenHandler.isInFullScreenMode() &&
        !settingsPageHandler.isOpen &&
        !infoPageHandler.isOpen
    );
    new FullScreenHandler(
      elements.minimizeFullScreenButton,
      elements.maximizeFullScreenButton,
      document.body
    );

    const gpu = await initializeGpu();

    elements.restartButton.addEventListener('click', () => game?.destroy());

    const deltaTimeCalculator = new DeltaTimeCalculator();
    const gameRules = new GameRules(performance.now() / 1000);
    let sliders: Array<SettingsSlider<any>> = [];

    elements.applyDefaults.addEventListener('click', () => {
      resetSettings();
      sliders.forEach((slider) => slider.updateSliderValueBasedOnSource());
    });

    const updateCounters = () => {
      elements.counters.innerHTML = `FPS: ${deltaTimeCalculator.fps.toFixed(2)}
current gen: ${formatNumber(game?.aliveAgentCounts.currentGenerationCount ?? 0)}
next gen: ${formatNumber(game?.aliveAgentCounts.nextGenerationCount ?? 0)}`;
      window.requestAnimationFrame(updateCounters);
    };
    updateCounters();

    while (!shouldStop) {
      game = new GameLoop(elements.canvas, gpu, deltaTimeCalculator, gameRules);

      if (sliders.length === 0) {
        sliders = setUpSettingsPage(elements.settingsContent, game.maxAgentCount);
      }

      await game.start();
    }
  } catch (e) {
    ErrorHandler.addError(Severity.ERROR, e.stack);
    console.error(e);
  }
};

main();
