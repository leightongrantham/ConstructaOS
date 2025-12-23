/**
 * Express server setup
 */

import express, { type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';
import { generateAxonometricConcept } from './services/aiRenderService.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
});

export function createServer(): express.Application {
  const app = express();

  // Middleware
  app.use(express.json());

  // Health check endpoint
  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok' });
  });

  // POST /render endpoint
  app.post(
    '/render',
    upload.single('image'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        if (!req.file) {
          return res.status(400).json({
            error: 'No image file provided. Please upload an image using multipart/form-data with field name "image"',
          });
        }

        const sketchBuffer = req.file.buffer;
        const result = await generateAxonometricConcept(sketchBuffer);

        res.json({
          imageBase64: result.imageBase64,
          model: result.model,
          promptVersion: result.promptVersion,
        });
      } catch (error) {
        next(error);
      }
    }
  );

  // Error handling middleware
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error('Error:', err);
    res.status(500).json({
      error: 'Internal server error',
      message: err.message,
    });
  });

  return app;
}

/**
 * Start the server
 */
export function startServer(): void {
  const app = createServer();
  const port = process.env.PORT ?? 3001;

  app.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });
}

