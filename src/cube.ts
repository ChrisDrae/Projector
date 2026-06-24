interface Point {
    x: number,
    y: number,
    z: number
}

type dimension = 'x' | 'y' | 'z'

interface Cube {
    d: number,
    vertices: Point[],
    translate: (magnitude: number, direction: dimension) => void,
    rotate: (angle: number, direction: dimension) => void
}




