This is recreational rendering and sim project that runs on canvas in the browser. 

To run the project for development with hot reloading run:
```
npm run dev 
npm run watch
```
To start the webserver with vite and tsc with watch to recompile on filechanges.

The goal is to create a typescript library for rendering physics sim, behavior of natural systems. 
The entry point is index.ts which runs a timeoutLoop within which you can make calls to either the canvas directly or use the renderer class and it's methods 
by passing it a canvas context. 
