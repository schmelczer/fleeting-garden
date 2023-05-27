import '../assets/icons/info.svg';
import GameLoop from './game-loop/game-loop';
import { GameRules } from './game-loop/game-rules';
import './index.scss';
import { CollapsiblePanelAnimator } from './page/collapsible-panel-animator';
import { FullScreenHandler } from './page/full-screen-handler';
import { MenuHider } from './page/menu-hider';
import { setUpSettingsPage } from './page/set-up-settings-page';
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

const getElements = () => ({
  aside: document.querySelector('aside') as HTMLDivElement,
  infoButton: document.querySelector('button.info') as HTMLButtonElement,
  infoElement: document.querySelector('.info-page') as HTMLDivElement,
  settingsPage: document.querySelector('.settings-page') as HTMLDivElement,
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
});

const main = async () => {
  const elements = getElements();

  let shouldStop = false;
  let game: GameLoop | null = null;

  ErrorHandler.addOnErrorListener((error, _metadata) => {
    elements.errorContainer.innerHTML += `
      <pre class="${error.severity}">${error.message}</div>
    `;
    game?.destroy();
    shouldStop = true;
  });

  try {
    applyArrayPlugins();

    const infoPageHandler = new CollapsiblePanelAnimator(
      elements.infoButton,
      elements.infoElement
    );
    const settingsPageHandler = new CollapsiblePanelAnimator(
      elements.settingsButton,
      elements.settingsPage
    );
    settingsPageHandler.onOpen = infoPageHandler.close.bind(infoPageHandler);
    infoPageHandler.onOpen = settingsPageHandler.close.bind(settingsPageHandler);

    new MenuHider(elements.aside, FullScreenHandler.isInFullScreenMode);
    new FullScreenHandler(
      elements.minimizeFullScreenButton,
      elements.maximizeFullScreenButton,
      document.body
    );

    const gpu = await initializeGpu();

    elements.restartButton.addEventListener('click', () => game?.destroy());

    const deltaTimeCalculator = new DeltaTimeCalculator();
    const gameRules = new GameRules(performance.now() / 1000);
    let isSettingsPageSetUp = false;

    const updateCounters = () => {
      elements.counters.innerHTML = `FPS: ${deltaTimeCalculator.fps.toFixed(2)}
current gen: ${formatNumber(game?.aliveAgentCounts.currentGenerationCount ?? 0)}
next gen: ${formatNumber(game?.aliveAgentCounts.nextGenerationCount ?? 0)}`;
      window.requestAnimationFrame(updateCounters);
    };
    updateCounters();

    while (!shouldStop) {
      game = new GameLoop(elements.canvas, gpu, deltaTimeCalculator, gameRules);
      if (!isSettingsPageSetUp) {
        isSettingsPageSetUp = true;
        setUpSettingsPage(elements.settingsPage, game.maxAgentCount, () =>
          game?.destroy()
        );
      }

      await game.start();
    }
  } catch (e) {
    ErrorHandler.addError(Severity.ERROR, e.stack);
    console.error(e);
  }
};

main();
