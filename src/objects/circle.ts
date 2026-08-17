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

    move(v: Vec3){
        const tmp = this.center
        this.center = Vec.addVectors(tmp, v)
    }
}

export default Circle