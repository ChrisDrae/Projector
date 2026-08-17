export interface Vec3Like {
    x: number;
    y: number;
    z: number;
}

export class Vec implements Vec3Like{
    x: number;
    y: number;
    z: number;

    static create(v: Vec3Like){
        return new Vec(v)
    }

    static addVectors(v: Vec3Like,v2: Vec3Like){
        return {
            x: v.x + v2.x,
            y: v.y + v2.y,
            z: v.z + v2.z
        }
    }

    constructor(v: Vec3Like){
        this.x = v.x,
        this.y = v.y,
        this.z = v.z
    }

    scale(s: number){
        return new Vec({
            x: this.x * s,
            y: this.y * s,
            z: this.z * s
        })
    }

    add(v: Vec3Like){
        return new Vec({
            x: this.x + v.x,
            y: this.y + v.y,
            z: this.z + v.z
        })
    }
}

