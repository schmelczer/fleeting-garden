import './index.scss';
import Renderer from './renderer';
import './utils/mulberry32';

const canvas = document.querySelector('canvas') as HTMLCanvasElement;
canvas.width = canvas.height = 640;
const renderer = new Renderer(canvas);
renderer.start();
