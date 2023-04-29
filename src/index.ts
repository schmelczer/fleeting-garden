import Renderer from './game-loop/game-loop';
import './styles/index.scss';

const main = () => {
  const canvas = document.querySelector('canvas');
  const renderer = new Renderer(canvas);
  renderer.start();
};

main();
