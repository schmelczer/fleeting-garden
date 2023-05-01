import '../assets/icons/info.svg';
import GameLoop from './game-loop/game-loop';
import './index.scss';
import { applyArrayPlugins } from './utils/array';
import { ErrorHandler, Severity } from './utils/error-handler';
import { FullScreenHandler } from './utils/full-screen-handler';
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
  minimizeFullScreenButton: document.querySelector(
    'button.minimize-full-screen'
  ) as HTMLButtonElement,
  maximizeFullScreenButton: document.querySelector(
    'button.maximize-full-screen'
  ) as HTMLButtonElement,
  restartButton: document.querySelector('button.restart') as HTMLButtonElement,
  canvas: document.querySelector('canvas') as HTMLCanvasElement,
  canvasContainer: document.querySelector('main.canvas-container') as HTMLCanvasElement,
  errorContainer: document.querySelector('.errors-container') as HTMLDivElement,
});

const main = async () => {
  const elements = getElements();

  let shouldStop = false;
  let game: GameLoop | null = null;

  ErrorHandler.addOnErrorListener((error, metadata) => {
    elements.errorContainer.innerHTML += `
      <pre class="${error.severity}">${error.message}</div>
    `;
    game?.destroy();
    shouldStop = true;
  });

  try {
    applyArrayPlugins();

    const defaultTimeToLive = 3500;
    const interval = 50;
    let timeToLive = defaultTimeToLive;
    setInterval(() => {
      timeToLive = Math.max(0, timeToLive - interval);
      elements.aside.style.opacity =
        timeToLive == 0 && FullScreenHandler.isInFullScreenMode() ? '0' : '1';
    }, interval);
    elements.aside.addEventListener('mouseover', () => (timeToLive = defaultTimeToLive));

    new FullScreenHandler(
      elements.minimizeFullScreenButton,
      elements.maximizeFullScreenButton,
      document.body
    );

    const gpu = await initializeGpu();

    elements.restartButton.addEventListener('click', () => game?.destroy());

    while (!shouldStop) {
      game = new GameLoop(elements.canvas, gpu);
      await game.start();
    }
  } catch (e) {
    ErrorHandler.addError(Severity.ERROR, e.message);
  }
};

main();
