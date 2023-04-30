import '../assets/icons/info.svg';
import GameLoop from './game-loop/game-loop';
import './index.scss';
import { applyArrayPlugins } from './utils/array';
import { handleFullScreen } from './utils/handle-full-screen';
import { initializeGPU } from './utils/webgpu/initialize-gpu';

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
  errorContainer: document.querySelector('.errors') as HTMLDivElement,
});

const main = async () => {
  applyArrayPlugins();
  const elements = getElements();

  handleFullScreen({
    minimizeButton: elements.minimizeFullScreenButton,
    maximizeButton: elements.maximizeFullScreenButton,
    target: elements.canvasContainer,
  });

  const gpu = await initializeGPU();

  let game: GameLoop | null = null;

  elements.restartButton.addEventListener('click', () => game?.destroy());

  while (true) {
    try {
      game = new GameLoop(elements.canvas, gpu);
      await game.start();
    } catch (e) {
      elements.errorContainer.innerHTML = e.message;
    }
  }
};

main();
