import Circle from "../objects/circle";

export class SpatialGrid {
    cells: Map<string, Circle[]> = new Map();
    cellSize: number;

    constructor(cellSize: number) {
        this.cellSize = cellSize;
    }

    private key(x: number, y: number, z: number): string {
        const cx = Math.floor(x / this.cellSize);
        const cy = Math.floor(y / this.cellSize);
        const cz = Math.floor(z / this.cellSize);
        return `${cx},${cy},${cz}`;
    }

    clear(): void {
        this.cells.clear();
    }

    insert(circle: Circle): void {
        const k = this.key(circle.center.x, circle.center.y, circle.center.z);
        let bucket = this.cells.get(k);
        if (!bucket) {
            bucket = [];
            this.cells.set(k, bucket);
        }
        bucket.push(circle);
    }

    getNearby(circle: Circle): Circle[] {
        const result: Circle[] = [];
        const cs = this.cellSize;
        const cx = Math.floor(circle.center.x / cs);
        const cy = Math.floor(circle.center.y / cs);
        const cz = Math.floor(circle.center.z / cs);

        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                for (let dz = -1; dz <= 1; dz++) {
                    const bucket = this.cells.get(`${cx+dx},${cy+dy},${cz+dz}`);
                    if (bucket) result.push(...bucket);
                }
            }
        }
        return result;
    }
}