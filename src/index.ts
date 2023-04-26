import './index.scss';
import Renderer from './renderer';
import './utils/mulberry32';

const main = () => {
  const canvas = document.querySelector('canvas');
  const renderer = new Renderer(canvas);
  renderer.start();
};

main();
