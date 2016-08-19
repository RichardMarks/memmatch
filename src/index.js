import {
  randomRangeInteger,
  swapElements,
  ExampleTileFactory,
  exampleLayout,
  BaseTileFactory,
  Board,
  BoardEvents, 
} from './Board';

const VERSION = '1.0.0';

const utils = {
  randomRangeInteger,
  swapElements,
};

const example = {
  ExampleTileFactory,
  exampleLayout,
};

export {
  VERSION,
  BaseTileFactory,
  Board,
  BoardEvents,
  example,
  utils, 
};
