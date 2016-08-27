/*
The MIT License (MIT)
Copyright (c) 2016 Richard Marks

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/
const xors128 = {
  state: [1, 2],
  next() {
    const s0 = xors128.state[1];
    xors128.state[0] = s0;
    let s1 = xors128.state[0];
    s1 ^= s1 << 23;
    s1 ^= s1 >> 17;
    s1 ^= s0;
    s1 ^= s0 >> 26;
    xors128.state[1] = s1;
    return xors128.state[0] + xors128.state[1];
  },
};

export function randomRangeInteger(min, max) {
  return min + (xors128.next() % (max - min));
}

export function swapElements(arr, p1, p2) {
  [ arr[p2], arr[p1] ] = [ arr[p1], arr[p2] ];
}

class EventBroadcaster {
  constructor() {
    this._listeners = {};
  }

  on(type, listener) {
    if (this._listeners[type]) {
      this._listeners[type].push(listener);
    } else {
      this._listeners[type] = [ listener ];
    }
  }

  broadcast(event) {
    const type = event.type;
    const listeners = this._listeners[type];
    if (listeners) {
      listeners.forEach(listener => listener(event));
    }
  }
}

export const BoardEvents = {
  SELECT_FIRST: 'select_first',
  SELECT_SECOND: 'select_second',
  DESELECT: 'deselect',
  MATCH: 'match',
  MISMATCH: 'mismatch',
  PLACE_TILE: 'place',
  SETUP: 'setup',
  SHUFFLE: 'shuffle',
  SHUFFLED: 'shuffled',
};

class BoardEvent {
  constructor(type) {
    this.type = type;
  }
  toString() {
    return `BoardEvent [${this.type.toUpperCase()}]`;
  }
}

class BoardSelectionEvent extends BoardEvent {
  constructor({ type, column, row, selection }) {
    super(type);
    this.column = column;
    this.row = row;
    this.selection = selection;
  }
}

class BoardMatchEvent extends BoardEvent {
  constructor({ type, pair, match = false }) {
    super(type);
    this.pair = pair;
    this.match = match;
  }
}

class BoardChangeEvent extends BoardEvent {
  constructor({ type, before, after }) {
    super(type);
    this.before = before;
    this.after = after;
  }
}

class BoardPlaceEvent extends BoardEvent {
  constructor({ type, column, row, tile, tileType }) {
    super(type);
    this.column = column;
    this.row = row;
    this.tile = tile;
    this.tileType = tileType;
  }
}

const TILE_FACTORY_SPEC = 'TileFactory';
export class BaseTileFactory {
  get spec() { return TILE_FACTORY_SPEC; }
  request(type) {
    throw new Error(`Unable to request type ${type}. request method must be overridden by subclass of BaseTileFactory`);
  }
  matchTiles(pair) {
    return pair.first === pair.second;
  }
}

export class Board extends EventBroadcaster {
  constructor({ columns, rows }) {
    super();
    if ((columns * rows) % 2 !== 0) {
      throw new Error(`Cannot create a Board with ${columns} columns and ${rows} rows. Not divisible by equal pairs`);
    }
    this._columns = columns;
    this._rows = rows;
    this._tiles = [];
    this._first = null;
    this._second = null;
    this._tileFactory = null;
  }

  get columns() { return this._columns; }

  get rows() { return this._rows; }

  get tiles() { return this._tiles.slice(); }

  get firstSelection() { return this._first; }

  get secondSelection() { return this._second; }

  deselect() {
    this._first = null;
    this._second = null;
    this.broadcast(new BoardSelectionEvent({ type: BoardEvents.DESELECT }));
  }

  select({ column, row }) {
    if (this._first && this._second) {
      this.deselect();
    }
    if (this._first) {
      this._second = this._getTile(column, row);
      this.broadcast(new BoardSelectionEvent({ type: BoardEvents.SELECT_SECOND, column, row, selection: this._second }));
      this._evaluateSelection();
    } else {
      this._first = this._getTile(column, row);
      this.broadcast(new BoardSelectionEvent({ type: BoardEvents.SELECT_FIRST, column, row, selection: this._first }));
    }
  }

  shuffle({ iterations }) {
    return new Promise(resolve => {
      for (let i = 0; i < iterations; i += 1) {
        const before = this._tiles.slice();
        const after = this._shuffleTiles();
        this.broadcast(new BoardChangeEvent({ type: BoardEvents.SHUFFLE, before, after }));
      }
      this.broadcast(new BoardChangeEvent({ type: BoardEvents.SHUFFLED }));
      resolve();
    });
  }

  setup({ tileFactory, layout }) {
    return new Promise((resolve, reject) => {
      if (!(tileFactory instanceof BaseTileFactory)) {
        reject(`Board tileFactory ${tileFactory} is not a TileFactory.`);
      }

      if (!Array.isArray(layout)) {
        reject(`Board layout is not an Array. ${layout.constructor.name} is not a valid type for the layout parameter of the Board#setup method`);
      }

      if (layout.length !== this._rows) {
        reject(`Board layout does not have correct number of rows. Found ${layout.length} of ${this._rows} rows in layout.`);
      }

      layout.forEach((rowLayout, row) => {
        if (rowLayout.length !== this._columns) {
          reject(`Board layout does not have correct number of columns in row ${row}. Found ${rowLayout.length} of ${this._columns} columns in layout.`);
        }
        rowLayout.forEach((type, column) => {
          tileFactory.request(type).then(tile => {
            this._placeTile(column, row, tile, type);
          }).catch(err => reject(err));
        });
      });
      this._tileFactory = tileFactory;
      this.broadcast(new BoardChangeEvent({ type: BoardEvents.SETUP }));
      resolve();
    });
  }

  _placeTile(column, row, tile, tileType) {
    this._setTile(column, row, tile);
    this.broadcast(new BoardPlaceEvent({ type: BoardEvents.PLACE_TILE, column, row, tile, tileType }));
  }

  _setTile(column, row, tile) {
    this._tiles[column + (row * this._columns)] = tile;
  }

  _getTile(column, row) {
    return this._tiles[column + (row * this._columns)];
  }

  _shuffleTiles() {
    let p1 = this._tiles.length;
    while (p1 > 1) {
      p1 -= 1;
      const p2 = randomRangeInteger(0, p1);
      swapElements(this._tiles, p1, p2);
    }
    return this._tiles.slice();
  }

  _evaluateSelection() {
    const pair = { first: this._first, second: this._second };
    const match = this._tileFactory.matchTiles(pair);
    const type = match ? BoardEvents.MATCH : BoardEvents.MISMATCH;
    this.broadcast(new BoardMatchEvent({ type, pair, match }));
  }
}

export class ExampleTileFactory extends BaseTileFactory {
  constructor(assets) {
    super();
    this._assets = assets;
  }

  request(type) {
    const builder = this[`_create${type}`];
    return new Promise((resolve, reject) => {
      if (builder) {
        return resolve(builder());
      }
      return reject(`Unable to find a builder for ${type} in the TileFactory`);
    });
  }

  matchTiles(pair) {
    return pair.first.constructor.name === pair.second.constructor.name;
  }

  _createApple() { return new this._assets.Apple(); }
  _createOrange() { return new this._assets.Orange(); }
  _createLemon() { return new this._assets.Lemon(); }
  _createMelon() { return new this._assets.Melon(); }
  _createGrapes() { return new this._assets.Grapes(); }
  _createPeach() { return new this._assets.Peach(); }
  _createBanana() { return new this._assets.Banana(); }
  _createPlum() { return new this._assets.Plum(); }
}

export const exampleLayout = [
  ['Apple', 'Orange', 'Lemon', 'Grapes'],
  ['Orange', 'Grapes', 'Melon', 'Apple'],
  ['Lemon', 'Peach', 'Plum', 'Banana'],
  ['Melon', 'Banana', 'Peach', 'Plum'],
];

/*
const scoreManager = new ScoreManager();
const boardView = new BoardView();
const board = new Board({ columns: 4, rows: 4 });

board.on(BoardEvents.SELECT_FIRST, selectEvent => {
  const { row, column, selection } = selectEvent;
  boardView.select(column, row, selection);
});

board.on(BoardEvents.SELECT_SECOND, selectEvent => {
  const { row, column, selection } = selectEvent;
  boardView.select(column, row, selection);
});

board.on(BoardEvents.MATCH, matchEvent => {
  pairs += 1;
  scoreManager.addScore(constants.POINTS_PER_MATCH);
  boardView.hidePair(matchEvent.pair);
});

board.on(BoardEvents.MISMATCH, matchEvent => {
  mistakes += 1;
  scoreManager.resetMultiplier();
  board.deselect();
  boardView.deselectPair(matchEvent.pair);
});

board.on(BoardEvents.SETUP, setupEvent => {
  boardView.boardReference = board;
  board.shuffle({ iterations: 3 });
});

board.on(BoardEvents.SHUFFLE, shuffleEvent => {
  const { before, after } = shuffleEvent;
  boardView.animateBoardChange(before, after);
});

board.on(BoardEvents.SHUFFLED, shuffleEvent => {
  boardView.ready(board.tiles);
});

boardView.on(boardView.inputEvents.SELECT_TILE, selectEvent => {
  const { column, row } = selectEvent;
  board.select({ column, row });
});

board.setup({ layout: levels[currentLevel], tileFactory: boardView.tileFactory }).then(() => {
  boardView.ready();
}).catch(err => window.console.error(err));

*/
