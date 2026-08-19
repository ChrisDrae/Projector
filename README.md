<div align="center">

# Projector

</div>

This is a recreational coding physics sim project that runs on canvas in the browser. 

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

  ![combo](https://github.com/user-attachments/assets/f1582f38-8829-4316-8bab-f034e5c665cc)

  
# Gravitation 

  ![combo](https://github.com/user-attachments/assets/c205217d-c5cf-4506-af08-258bfb359b9f)

# Optimisations

Collision check partitioning is the first big optimisation in this project. It reduces the brute force collision check with every other circle object to just all circles sharing the same box. Reducing the former O(n^2)
drastically. 

</div>
