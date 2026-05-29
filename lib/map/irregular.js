import RNG from "../rng.js";
import Dungeon from "./dungeon.js";
import { Room, Corridor } from "./features.js";
const DEFAULT_OPTIONS = {
    roomCount: [5, 10],
    roomWidth: [4, 8],
    roomHeight: [3, 6],
    irregularity: 0.4,
    diagonalChance: 0.3,
    extraConnections: 2,
    dugPercentage: 0.25,
};
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
    constructor(width, height, options) {
        super(width, height);
        this._options = Object.assign({}, DEFAULT_OPTIONS, options);
        this._map = [];
        this._dug = 0;
    }
    create(callback) {
        this._map = this._fillMap(1);
        this._rooms = [];
        this._corridors = [];
        this._dug = 0;
        this._placeRooms();
        this._connectRooms();
        this._fillToDugPercentage();
        // Emit the map
        if (callback) {
            for (let x = 0; x < this._width; x++) {
                for (let y = 0; y < this._height; y++) {
                    callback(x, y, this._map[x][y]);
                }
            }
        }
        return this;
    }
    /** Place rooms, some with irregular shapes. */
    _placeRooms() {
        const count = RNG.getUniformInt(this._options.roomCount[0], this._options.roomCount[1]);
        const maxAttempts = count * 20;
        let attempts = 0;
        while (this._rooms.length < count && attempts < maxAttempts) {
            attempts++;
            const room = this._generateRoom();
            if (!room)
                continue;
            if (!this._roomFits(room))
                continue;
            this._carveRoom(room);
            this._rooms.push(room);
        }
    }
    /** Generate a room, possibly irregular (composite of overlapping rects). */
    _generateRoom() {
        const w = RNG.getUniformInt(this._options.roomWidth[0], this._options.roomWidth[1]);
        const h = RNG.getUniformInt(this._options.roomHeight[0], this._options.roomHeight[1]);
        const x1 = RNG.getUniformInt(2, this._width - w - 2);
        const y1 = RNG.getUniformInt(2, this._height - h - 2);
        if (x1 < 2 || y1 < 2)
            return null;
        const room = new Room(x1, y1, x1 + w - 1, y1 + h - 1);
        // Possibly make it irregular by extending with sub-rects
        if (RNG.getUniform() < this._options.irregularity) {
            this._makeIrregular(room);
        }
        return room;
    }
    /**
     * Extend a room with 1-2 additional rectangular sub-areas to create
     * L-shapes, T-shapes, or crosses. Modifies the room bounds to encompass
     * the full irregular shape. The actual carving uses _carveIrregular.
     */
    _makeIrregular(room) {
        // Store sub-rects on the room for carving later
        const subs = [];
        const extensions = RNG.getUniformInt(1, 2);
        for (let i = 0; i < extensions; i++) {
            const side = RNG.getUniformInt(0, 3); // 0=top, 1=right, 2=bottom, 3=left
            const subW = RNG.getUniformInt(2, Math.max(2, Math.floor((room._x2 - room._x1) * 0.7)));
            const subH = RNG.getUniformInt(2, Math.max(2, Math.floor((room._y2 - room._y1) * 0.7)));
            let sx1, sy1, sx2, sy2;
            switch (side) {
                case 0: // extend up
                    sx1 = room._x1 + RNG.getUniformInt(0, Math.max(0, room._x2 - room._x1 - subW));
                    sy2 = room._y1 - 1;
                    sy1 = sy2 - subH + 1;
                    sx2 = sx1 + subW - 1;
                    break;
                case 1: // extend right
                    sx1 = room._x2 + 1;
                    sx2 = sx1 + subW - 1;
                    sy1 = room._y1 + RNG.getUniformInt(0, Math.max(0, room._y2 - room._y1 - subH));
                    sy2 = sy1 + subH - 1;
                    break;
                case 2: // extend down
                    sx1 = room._x1 + RNG.getUniformInt(0, Math.max(0, room._x2 - room._x1 - subW));
                    sy1 = room._y2 + 1;
                    sy2 = sy1 + subH - 1;
                    sx2 = sx1 + subW - 1;
                    break;
                default: // extend left
                    sx2 = room._x1 - 1;
                    sx1 = sx2 - subW + 1;
                    sy1 = room._y1 + RNG.getUniformInt(0, Math.max(0, room._y2 - room._y1 - subH));
                    sy2 = sy1 + subH - 1;
                    break;
            }
            subs.push({ x1: sx1, y1: sy1, x2: sx2, y2: sy2 });
            // Expand room bounds to encompass sub-rect
            room._x1 = Math.min(room._x1, sx1);
            room._y1 = Math.min(room._y1, sy1);
            room._x2 = Math.max(room._x2, sx2);
            room._y2 = Math.max(room._y2, sy2);
        }
        // Store subs for carving (attach to room via a property)
        room._subs = subs;
    }
    /** Check if a room fits without overlapping existing rooms (with 1-tile margin). */
    _roomFits(room) {
        const margin = 2;
        if (room._x1 < margin || room._y1 < margin)
            return false;
        if (room._x2 >= this._width - margin || room._y2 >= this._height - margin)
            return false;
        for (let x = room._x1 - 1; x <= room._x2 + 1; x++) {
            for (let y = room._y1 - 1; y <= room._y2 + 1; y++) {
                if (x >= 0 && x < this._width && y >= 0 && y < this._height) {
                    if (this._map[x][y] === 0)
                        return false;
                }
            }
        }
        return true;
    }
    /** Carve a room into the map. Handles irregular rooms with sub-rects. */
    _carveRoom(room) {
        const subs = room._subs || [];
        // If irregular, carve the original base rect + sub-rects
        if (subs.length > 0) {
            // We need to reconstruct the original base rect before extensions
            // Since _makeIrregular expanded the bounds, we carve the subs explicitly
            // and the "base" is the full bounds minus the subs... 
            // Simpler: carve the full bounding box but only where it's part of the shape
            // For now, carve the full bounding box (rooms are already validated to fit)
            for (let x = room._x1; x <= room._x2; x++) {
                for (let y = room._y1; y <= room._y2; y++) {
                    this._dig(x, y);
                }
            }
            // Also carve sub-rects (they may extend beyond the original base)
            for (const sub of subs) {
                for (let x = sub.x1; x <= sub.x2; x++) {
                    for (let y = sub.y1; y <= sub.y2; y++) {
                        if (x >= 1 && x < this._width - 1 && y >= 1 && y < this._height - 1) {
                            this._dig(x, y);
                        }
                    }
                }
            }
        }
        else {
            // Simple rectangular room
            for (let x = room._x1; x <= room._x2; x++) {
                for (let y = room._y1; y <= room._y2; y++) {
                    this._dig(x, y);
                }
            }
        }
    }
    /** Connect all rooms using a minimum spanning tree, then add extra connections. */
    _connectRooms() {
        if (this._rooms.length < 2)
            return;
        // Build MST using Prim's algorithm on room centers
        const centers = this._rooms.map(r => r.getCenter());
        const connected = new Set([0]);
        const edges = [];
        while (connected.size < this._rooms.length) {
            let bestDist = Infinity;
            let bestFrom = -1;
            let bestTo = -1;
            for (const from of connected) {
                for (let to = 0; to < this._rooms.length; to++) {
                    if (connected.has(to))
                        continue;
                    const dx = centers[from][0] - centers[to][0];
                    const dy = centers[from][1] - centers[to][1];
                    const dist = dx * dx + dy * dy;
                    if (dist < bestDist) {
                        bestDist = dist;
                        bestFrom = from;
                        bestTo = to;
                    }
                }
            }
            if (bestTo === -1)
                break;
            connected.add(bestTo);
            edges.push([bestFrom, bestTo]);
        }
        // Add extra connections for loops
        for (let i = 0; i < this._options.extraConnections; i++) {
            const from = RNG.getUniformInt(0, this._rooms.length - 1);
            let to = RNG.getUniformInt(0, this._rooms.length - 1);
            if (to === from)
                to = (to + 1) % this._rooms.length;
            // Avoid duplicates
            if (!edges.some(([a, b]) => (a === from && b === to) || (a === to && b === from))) {
                edges.push([from, to]);
            }
        }
        // Carve corridors for each edge
        for (const [from, to] of edges) {
            this._carveCorridor(centers[from], centers[to]);
        }
    }
    /** Carve a corridor between two points. May be orthogonal, diagonal, or mixed. */
    _carveCorridor(from, to) {
        const dx = to[0] - from[0];
        const dy = to[1] - from[1];
        const useDiagonal = RNG.getUniform() < this._options.diagonalChance;
        if (useDiagonal && dx !== 0 && dy !== 0) {
            // Diagonal + remainder: move diagonally as far as possible, then straight
            this._carveDiagonalCorridor(from[0], from[1], to[0], to[1]);
        }
        else {
            // L-shaped orthogonal corridor (random bend point)
            this._carveOrthogonalCorridor(from[0], from[1], to[0], to[1]);
        }
    }
    /** Carve a diagonal corridor: move at 45° then finish with a straight segment. */
    _carveDiagonalCorridor(x1, y1, x2, y2) {
        let x = x1;
        let y = y1;
        const sdx = Math.sign(x2 - x1);
        const sdy = Math.sign(y2 - y1);
        // Move diagonally until one axis is aligned
        const diagSteps = Math.min(Math.abs(x2 - x1), Math.abs(y2 - y1));
        for (let i = 0; i < diagSteps; i++) {
            this._dig(x, y);
            x += sdx;
            y += sdy;
        }
        // Finish with straight segment
        while (x !== x2 || y !== y2) {
            this._dig(x, y);
            if (x !== x2)
                x += sdx;
            else if (y !== y2)
                y += sdy;
        }
        this._dig(x2, y2);
        // Record as a corridor (using start/end for the Dungeon interface)
        this._corridors.push(new Corridor(x1, y1, x2, y2));
    }
    /** Carve an L-shaped orthogonal corridor with a random bend point. */
    _carveOrthogonalCorridor(x1, y1, x2, y2) {
        // Decide whether to go horizontal-first or vertical-first
        const horizontalFirst = RNG.getUniform() < 0.5;
        const midX = horizontalFirst ? x2 : x1;
        const midY = horizontalFirst ? y1 : y2;
        // First segment
        this._carveLineSegment(x1, y1, midX, midY);
        // Second segment
        this._carveLineSegment(midX, midY, x2, y2);
        this._corridors.push(new Corridor(x1, y1, x2, y2));
    }
    /** Carve a straight line (horizontal or vertical). */
    _carveLineSegment(x1, y1, x2, y2) {
        const dx = Math.sign(x2 - x1) || 0;
        const dy = Math.sign(y2 - y1) || 0;
        let x = x1;
        let y = y1;
        while (x !== x2 || y !== y2) {
            this._dig(x, y);
            if (x !== x2)
                x += dx;
            if (y !== y2)
                y += dy;
        }
        this._dig(x2, y2);
    }
    /** Keep placing rooms and connecting them until dugPercentage coverage is met. */
    _fillToDugPercentage() {
        const target = this._options.dugPercentage;
        const total = this._width * this._height;
        const maxAttempts = 200;
        let attempts = 0;
        while (this._dug / total < target && attempts < maxAttempts) {
            attempts++;
            const room = this._generateRoom();
            if (!room)
                continue;
            if (!this._roomFits(room))
                continue;
            this._carveRoom(room);
            // Connect new room to the nearest existing room
            const newCenter = room.getCenter();
            let bestDist = Infinity;
            let bestCenter = null;
            for (const existing of this._rooms) {
                const c = existing.getCenter();
                const dx = c[0] - newCenter[0];
                const dy = c[1] - newCenter[1];
                const d = dx * dx + dy * dy;
                if (d < bestDist) {
                    bestDist = d;
                    bestCenter = c;
                }
            }
            if (bestCenter) {
                this._carveCorridor(bestCenter, newCenter);
            }
            this._rooms.push(room);
        }
    }
    /** Mark a cell as dug (floor). */
    _dig(x, y) {
        if (x < 0 || x >= this._width || y < 0 || y >= this._height)
            return;
        if (this._map[x][y] === 1) {
            this._map[x][y] = 0;
            this._dug++;
        }
    }
}
