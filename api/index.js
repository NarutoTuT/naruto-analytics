 import express from "express";
 import compression from "compression";
 import morgan from "morgan";
 import path from "path";
 import { fileURLToPath } from "url";
 import { createRequestHandler } from "@react-router/express";
 import * as build from "../build/server/index.js";
 
 const __dirname = path.dirname(fileURLToPath(import.meta.url));
 const app = express();
 
 app.disable("x-powered-by");
 app.use(compression());
 
 // Serve static assets from the client build
 app.use(
   "/assets",
   express.static(path.join(__dirname, "../build/client/assets"), {
     immutable: true,
     maxAge: "1y",
   })
 );
 app.use("/", express.static(path.join(__dirname, "../build/client")));
 app.use(express.static(path.join(__dirname, "../public"), { maxAge: "1h" }));
 
 // Request logging
 app.use(morgan("tiny"));
 
 // All requests handled by React Router
 app.all("*", createRequestHandler({ build, mode: process.env.NODE_ENV || "production" }));
 
 export default app;
