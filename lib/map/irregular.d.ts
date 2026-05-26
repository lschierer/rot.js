import { CreateCallback } from "./map.js";
import Dungeon from "./dungeon.js";
import { Room } from "./features.js";
interface Options {
    roomCount: [number, number];
    roomWidth: [number, number];
    roomHeight: [number, number];
    irregularity: number;
    diagonalChance: number;
    extraConnections: number;
    dugPercentage: number;
}
/**
 * @class Irregular dungeon generator.
 *
 * Produces dungeons with non-rectangular rooms (L-shapes, T-shapes, crosses)
 * connected by corridors that may include diagonal (45°) segments.
 * Inspired by Castle of the Winds (1993) dungeon layouts.
 *
 * Algorithm:
 * 1. Place rooms (some irregular) without overlap
 * 2. Connect all rooms via a minimum spanning tree
 * 3. Corridors may be orthogonal, diagonal, or mixed
 * 4. Add extra connections for loops
 */
export default class Irregular extends Dungeon {
    _options: Options;
    _map: number[][];
    _dug: number;
    constructor(width: number, height: number, options?: Partial<Options>);
    create(callback?: CreateCallback): this;
    /** Place rooms, some with irregular shapes. */
    _placeRooms(): void;
    /** Generate a room, possibly irregular (composite of overlapping rects). */
    _generateRoom(): Room | null;
    /**
     * Extend a room with 1-2 additional rectangular sub-areas to create
     * L-shapes, T-shapes, or crosses. Modifies the room bounds to encompass
     * the full irregular shape. The actual carving uses _carveIrregular.
     */
    _makeIrregular(room: Room): void;
    /** Check if a room fits without overlapping existing rooms (with 1-tile margin). */
    _roomFits(room: Room): boolean;
    /** Carve a room into the map. Handles irregular rooms with sub-rects. */
    _carveRoom(room: Room): void;
    /** Connect all rooms using a minimum spanning tree, then add extra connections. */
    _connectRooms(): void;
    /** Carve a corridor between two points. May be orthogonal, diagonal, or mixed. */
    _carveCorridor(from: number[], to: number[]): void;
    /** Carve a diagonal corridor: move at 45° then finish with a straight segment. */
    _carveDiagonalCorridor(x1: number, y1: number, x2: number, y2: number): void;
    /** Carve an L-shaped orthogonal corridor with a random bend point. */
    _carveOrthogonalCorridor(x1: number, y1: number, x2: number, y2: number): void;
    /** Carve a straight line (horizontal or vertical). */
    _carveLineSegment(x1: number, y1: number, x2: number, y2: number): void;
    /** Mark a cell as dug (floor). */
    _dig(x: number, y: number): void;
}
export {};
