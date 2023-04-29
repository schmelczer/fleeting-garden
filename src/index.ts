import GameLoop from './game-loop/game-loop';
import './styles/index.scss';

const main = () => {
  const canvas = document.querySelector('canvas');
  const game = new GameLoop(canvas);
  game.start();
};

main();
