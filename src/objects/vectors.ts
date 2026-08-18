import { Vec3 } from "../rendering/renderer";

export interface Vec {
    x: number;
    y: number;
    z: number;
}

export class Vec implements Vec{
    x: number;
    y: number;
    z: number;

    static create(v: Vec3){
        return new Vec(v)
    }

    static addVectors(v: Vec3,v2: Vec3){
        return {
            x: v.x + v2.x,
            y: v.y + v2.y,
            z: v.z + v2.z
        }
    }

    static subtractVectors(v: Vec3,v2: Vec3){
        return {
            x: v.x - v2.x,
            y: v.y - v2.y,
            z: v.z - v2.z
        }
    }

    static distanceTo(d: Vec3, v: Vec3){
        const dx = v.x - d.x;
        const dy = v.y - d.y;
        const dz = v.z - d.z;
        const distance = Math.sqrt(Math.pow(dx,2) + Math.pow(dy,2) + Math.pow(dz,2));
        return distance;
    }

    static dot(v: Vec3, b: Vec3): number{
        const dotproduct = (v.x*b.x) + (v.y*b.y) + (v.z*b.z)
        return dotproduct;
    }

    static divideVector(v: Vec3, d: number) {
        const div = new Vec(
            {x: v.x / d,y: v.y / d,z: v.z / d}
        )
        return div;
    }

    static scaleVector(v: Vec3, s: number){
        return new Vec({
            x: v.x * s,
            y: v.y * s,
            z: v.z * s
        })
    }
    static  getMagnitude(v: Vec3): number{
        const m = Math.sqrt(Math.pow(v.x,2) + Math.pow(v.y,2) + Math.pow(v.z,2));
        return m;
    }

    static getNormalvector(v: Vec3){
        const mag = Vec.getMagnitude(v);
        return new Vec(
            {
                x: v.x / mag,
                y: v.y / mag,
                z: v.z / mag
            }
        ) 
    }

    constructor(v: Vec3){
        this.x = v.x,
        this.y = v.y,
        this.z = v.z
    }


    scaleSelf(s: number){
        this.x = this.x * s,
        this.y = this.y * s,
        this.z = this.z *s
    }

    add(v: Vec){
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

    distanceTo(v: Vec){
        const dx = v.x - this.x;
        const dy = v.y - this.y;
        const dz = v.z - this.y;
        const d = Math.sqrt(Math.pow(dx,2) + Math.pow(dy,2) + Math.pow(dz,2));
        return d;
    }
}

