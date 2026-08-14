import { Vec3 } from "../rendering/renderer";

interface ParticleProps {
    position: Vec3,
    mass: number
}

export class Particle implements ParticleProps {
    position: Vec3;
    mass: number;

    constructor(position: Vec3, mass: number){
        this.mass = mass;
        this.position = position
    }

    setPosition(v: Vec3){
        this.position = v
    }
}