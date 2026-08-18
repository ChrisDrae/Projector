import { Vec3 } from "../rendering/renderer";
import { Vec } from "./vectors";

interface CircleProps {
    radius:  number,
    center: Vec3
}

class Circle implements CircleProps{
    radius: number;
    baseRadius: number;
    center: Vec3;
    velocity: Vec3;
    acceleration: Vec3;
    mass: number;

    constructor(center: Vec3, radius: number = 0.1, velocity: Vec3 = { x:0,y:0,z:0}, mass: number = 1){
        this.radius = radius
        this.baseRadius = radius;
        this.center = center;
        this.velocity = velocity;
        this.acceleration = ({ x:0,y:0,z:0});
        this.mass = mass;
    }

    move(){
        const tmp = this.center
        this.center = Vec.addVectors(tmp, this.velocity)
    }

    translate(d: Vec3){
        const tmp  =  this.center;
        this.center =  Vec.addVectors(tmp, d)
    }

    isAtPosition(p: Vec3){
        if(this.center === p) return true;
        return false
    }

    accelerate(acc: Vec3){
        this.velocity = Vec.addVectors(this.velocity, acc)
    }

    resizeToDistanceZ(){
        if(this.center.z === 0 ) return;
        const fov = 2
        const scale = fov / ( fov + this.center.z) 
        this.radius = this.baseRadius * scale
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

    applyForce(f: Vec3): void {
        this.acceleration.x += f.x / this.mass;
        this.acceleration.y += f.y / this.mass;
        this.acceleration.z += f.z / this.mass;
    }

    integrate(dt: number): void {
        this.velocity.x += this.acceleration.x * dt;
        this.velocity.y += this.acceleration.y * dt;
        this.velocity.z += this.acceleration.z * dt;

        this.center.x += this.velocity.x * dt;
        this.center.y += this.velocity.y * dt;
        this.center.z += this.velocity.z * dt;

        this.acceleration.x = 0;
        this.acceleration.y = 0;
        this.acceleration.z = 0;
    }

    
  addKeycontrol(): void {
    window.addEventListener("keydown", (event: KeyboardEvent) => {
      const step = 0.1;

      switch (event.key) {
        case "ArrowUp":
          this.translate({ x: 0, y: 0, z: -step });
          break;
        case "ArrowDown":
          this.translate({ x: 0, y: 0, z: step });
          break;
        case "ArrowLeft":
          this.translate({ x: step, y: 0, z: 0 });
          break;
        case "ArrowRight":
          this.translate({ x: -step, y: 0, z: 0 });
          break;
      }
    });
  }

}

export default Circle