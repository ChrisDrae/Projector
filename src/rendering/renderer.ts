export type Vec3 = { x: number; y: number; z: number };
export type Vec2 = { x: number; y: number}

export interface Renderer {
    ctx: CanvasRenderingContext2D;
    background: string;
    dimensions: [number, number]
}


const ELEMENT = "#18d641";


export class RendererEngine implements Renderer {
    ctx: CanvasRenderingContext2D;
    background: string;
    dimensions: [number, number];

    constructor(props: Renderer){
        this.ctx = props.ctx,
        this.background = props.background,
        this.dimensions = props.dimensions
    }

    clear(): void {
        this.ctx.fillStyle = this.background;
        this.ctx.fillRect(0, 0, this.dimensions[0], this.dimensions[1]);
    }

    drawPoint({ x, y, z }: Vec3): void {
        /**This Draws the Points Projected from 3D coordinates onto the Canvas with the {x: 0,y: 0} in the center  */
        this.ctx.fillStyle = ELEMENT;
        const pV = toScreenCoordinates(project(toCamera({x, y, z})), this.dimensions)
        const c = 10;
        this.ctx.fillRect(pV.x - c / 2, pV.y - c / 2, c, c);
    }

    drawLine(p: Vec3, d: Vec3): void {
        //Project and Translate
        const pV = toScreenCoordinates(project(toCamera(p)), this.dimensions)
        const dV = toScreenCoordinates(project(toCamera(d)), this.dimensions)
        //Draw 2D Context Line
        this.ctx.lineWidth = 10;
        this.ctx.strokeStyle = ELEMENT;
        this.ctx.beginPath();
        this.ctx.moveTo(pV.x, pV.y);
        this.ctx.lineTo(dV.x, dV.y);
        this.ctx.closePath();
        this.ctx.stroke();
    }  
}

export function rotateAroundZ({ x, y, z }: Vec3, angle: number): Vec3 {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    return {
        x: x * c - y * s,
        y: x * s + y * c,
        z,
    };
}

export function translateZ({ x, y, z }: Vec3, dz: number): Vec3 {
    return {
        x,
        y,
        z: z + dz,
    };
}


export function rotateAroundY({ x, y, z }: Vec3, angle: number): Vec3 {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    return {
        x: x * c - z * s,
        y,
        z: x * s + z * c,
    };
}


export function rotateAroundX({ x, y, z }: Vec3, angle: number): Vec3 {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    return {
        x: x,
        y: y * c - z * s,
        z: y * s + z * c,
    };
}

//Coordinate Space Logic Functions 

const CAMERA_Z = -1.5

export function toCamera(p: Vec3): Vec3 {
    return {x: p.x, y: p.y, z: p.z - CAMERA_Z }
}

export function project({ x, y, z }: Vec3): Vec2 {
    return {
        x: x / z,
        y: y / z,
    };
}

export function toScreenCoordinates(p: Vec2, d: [number, number]): Vec2 {
    return {
        x: (p.x + 1) / 2*d[0],
        y: (1 - (p.y + 1) / 2) * d[1],
    };
}