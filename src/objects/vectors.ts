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

    constructor(v: Vec3Like){
        this.x = v.x,
        this.y = v.y,
        this.z = v.z
    }

    add(v: Vec3Like){
        return new Vec({
            x: this.x + v.x,
            y: this.y + v.y,
            z: this.z + v.z
        })
    }
}

