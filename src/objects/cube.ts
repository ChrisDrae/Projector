import { Vec, Vec3Like } from "./vectors.js";

interface Point {
    x: number,
    y: number,
    z: number
}

export class Cube {
    dimension: number;
    points: Vec[];
    faces: number[][];

    constructor(d: number){
        const h = d/2
        this.dimension = d;
        this.points = [
            Vec.create({ x: h, y: h, z: h }),
            Vec.create({ x: -h, y: -h, z: h }),
            Vec.create({ x: h, y: -h, z: h }),
            Vec.create({ x: -h, y: h, z: h }),
            Vec.create({ x: h, y: h, z: -h }),
            Vec.create({ x: -h, y: -h, z: -h }),
            Vec.create({ x: h, y: -h, z: -h }),
            Vec.create({ x: -h, y: h, z: -h }),
        ],
        this.faces = [  
            [0, 2, 1, 3],
            [4, 6, 5, 7],
            [0, 4],
            [3, 7],
            [2, 6],
            [1, 5],
        ]
    }

    translate(v: Vec3Like){
        const newPoints = [];
        for(const p of this.points){
            newPoints.push(p.add(v))
        }
        this.points = newPoints
    }
}

