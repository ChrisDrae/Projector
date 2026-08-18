This is recreational rendering and sim project that runs on canvas in the browser. 

To run the project for development with hot reloading run:
```
npm run dev 
```
To start the webserver with vite and tsc with watch to recompile on filechanges.

The goal is to create a typescript library for rendering physics sim, behavior of natural systems. 
The entry point is index.ts which runs a timeoutLoop within which you can make calls to either the canvas directly or use the renderer class and it's methods 
by passing a canvas context to it. 

The basis for the 3D is this perspective formula:

$x' = \frac{x}{z}, \quad y' = \frac{y}{z}$

<img width="986" height="940" alt="image" src="https://github.com/user-attachments/assets/1db73af3-1929-44ad-8b45-3720c3a8a154" />
______________________________________________________________________________________________________________________________________
______________________________________________________________________________________________________________________________________

# Particle Animation and Collision
![particles](https://github.com/user-attachments/assets/4c660a08-4b94-4058-b0d3-4bffed4bff41)
