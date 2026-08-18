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

    static distanceTo(d: Vec3Like, v: Vec3Like){
        const dx = v.x - d.x;
        const dy = v.y - d.y;
        const dz = v.z - d.z;
        const distance = Math.sqrt(Math.pow(dx,2) + Math.pow(dy,2) + Math.pow(dz,2));
        return distance;
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

    scaleSelf(s: number){
        this.x = this.x * s,
        this.y = this.y * s,
        this.z = this.z *s
    }

    add(v: Vec3Like){
        return new Vec({
            x: this.x + v.x,
            y: this.y + v.y,
            z: this.z + v.z
        })
    }

    magnitude(): number{
        const m = Math.sqrt(Math.pow(this.x,2) + Math.pow(this.y,2) + Math.pow(this.z,2));
        return m;
    }

    distanceTo(v: Vec3Like){
        const dx = v.x - this.x;
        const dy = v.y - this.y;
        const dz = v.z - this.y;
        const d = Math.sqrt(Math.pow(dx,2) + Math.pow(dy,2) + Math.pow(dz,2));
        return d;
    }
}

