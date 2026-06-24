console.log(canvas)
canvas.width = 800
canvas.height = 800

const ELEMENT = '#18d641'
const BACKGROUND = '#333131'

const ctx = canvas.getContext("2d")
console.log(ctx)

function clear(){
    ctx.fillStyle = BACKGROUND
    ctx.fillRect(0, 0, canvas.width, canvas.height)
}

function project({x,y,z}){
    return {
        x: x/z,
        y: y/z
    }
}

function screen(p){
    return {
        x: (p.x + 1)/2*canvas.width,
        y: (1 - (p.y + 1)/2)*canvas.height
    }
}

function drawPoint({x,y}){
    ctx.fillStyle = ELEMENT
    const c = 10
    ctx.fillRect(x - (c/2),y - (c/2) ,c,c)
}

p = {x: 50,y: 50,z: 50} 

const FPS = 60
let dz = 0;
clear()

const rect = [
    {x: 0.25,y: 0.25, z: 0.25},
    {x: -0.25,y: -0.25, z: 0.25},
    {x: 0.25,y: -0.25, z: 0.25},
    {x: -0.25,y: 0.25, z: 0.25},

    {x: 0.25,y: 0.25, z: -0.25},
    {x: -0.25,y: -0.25, z: -0.25},
    {x: 0.25,y: -0.25, z: -0.25},
    {x: -0.25,y: 0.25, z: -0.25},
]

function rotate_xy({x,y,z}, angle){
    const c = Math.cos(angle)
    const s = Math.sin(angle)
    return {
        x: x * c - z * s,
        y: y,
        z: x*s + z * c
    } 
}

function drawLine(p,d){
    ctx.lineWidth = 10
    ctx.strokeStyle = ELEMENT
    ctx.beginPath()
    ctx.moveTo(p.x, p.y)
    ctx.lineTo(d.x, d.y)
    ctx.closePath()
    ctx.stroke()
}

function translate_z({x,y,z}, dz){
    return {
        x: x,
        y: y,
        z: z + dz
    }
}

fs = [
    [0,2,1,3],
    [4,6,5,7],
    [0,4], [3,7], [2,6], [ 1, 5]
]

function rotate_yz({x,y,z}, angel){
    const c = Math.cos(angel)
    const s = Math.sin(angel)
    return {
        x: x*c - y*s,
        y: x*s + y*c,
        z,
    }

}

function drawRetreatingCube(offset = 0){
    for(const f of fs){
        for(i = 0; i < f.length; i++){
            const a = rect[f[i]]
            const b = rect[f[(i + 1)%f.length]]
            drawPoint(screen(project(translate_z(rotate_yz(rotate_xy(a, angle),angle), dz - offset))))
            drawLine(screen(project((translate_z(rotate_yz(rotate_xy(a, angle), angle), dz - offset)))),
             (screen(project((translate_z(rotate_yz(rotate_xy(b, angle), angle), dz - offset)))))
            )

        }
    }
}


let angle = 0

function frame(){
    const dt = 1/FPS
    if(dz < 2) dz += 1 * dt
    angle += 2*Math.PI *  dt /10
    clear()
    
    drawRetreatingCube()
    drawRetreatingCube(1)
    setTimeout(frame, 1000/FPS)
}

setTimeout(frame, 1000/FPS)

