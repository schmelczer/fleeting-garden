import GameLoop from './game-loop/game-loop';
import './styles/index.scss';
import { applyArrayPlugins } from './utils/array';

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

applyArrayPlugins();

const errorContainer = document.querySelector('.errors');

const main = () => {
  try {
    const canvas = document.querySelector('canvas');
    const game = new GameLoop(canvas);
    game.start();
  } catch (e) {
    errorContainer.innerHTML = e.message;
  }
};

main();
