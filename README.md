<div align="center">

# Projector

</div>

This is recreational rendering and sim project that runs on canvas in the browser. 

To run the project for development with hot reloading run:
```
npm run dev 
```
To start the webserver with vite and tsc with watch to recompile on filechanges.

The goal is to create a typescript library for rendering physics sim, behavior of natural systems. 
The entry point is index.ts which runs a timeoutLoop within which you can make calls to either the canvas directly or use the renderer class and it's methods 
by passing a canvas context to it. 

<div align="center">

# 3D Animation

</div>

The basis for the 3D is this perspective formula:

<div align="center">
  
## $x' = \frac{x}{z}, \quad y' = \frac{y}{z}$



![3D](https://github.com/user-attachments/assets/37327168-5bec-469c-b144-f376c970d03c)

<div align="center">

# Particle Animation and Collision



  ![particles](https://github.com/user-attachments/assets/4c660a08-4b94-4058-b0d3-4bffed4bff41)

# 3D Collision

  ![combo](https://github.com/user-attachments/assets/70e4f069-3418-4d83-adcd-d4f1a2d8c2b7)

</div>
