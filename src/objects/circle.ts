import { Vec3 } from "../rendering/renderer";
import { Vec } from "./vectors";

interface CircleProps {
    radius:  number,
    center: Vec3
}

class Circle implements CircleProps{
    radius: number;
    center: Vec3;

    constructor(center: Vec3, radius: number = 0.1){
        this.radius = radius
        this.center = center
    }

    move(v: Vec){
        const tmp = this.center
        this.center = Vec.addVectors(tmp, v)
    }

    isAtPosition(p: Vec3){
        if(this.center === p) return true;
        return false
    }

    isTouchingCircle(c: Circle): boolean{
        const radi = c.radius + this.radius
        const b = Vec.distanceTo(c.center, this.center) < radi 
        return b;
    }

    isMovingTowards(c: Circle, v: Vec): boolean {
        const toOther = Vec.subtractVectors(v, c.center);
        if(Vec.dot(toOther, v) > 0) {
            return true
        }
        return false
    }
}

export default Circle