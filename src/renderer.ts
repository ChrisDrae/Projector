type Vec3 = { x: number; y: number; z: number };
type Vec2 = { x: number; y: number}

interface Renderer {
    ctx: CanvasRenderingContext2D;
    clear(): void;
    drawPoint(p: Vec2): void
}