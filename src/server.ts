/**
 * Express server setup
 */

import express, { type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { generateConceptImage } from './services/aiRenderService.js';
import type { RenderType } from './types/render.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
});

const VALID_RENDER_TYPES: RenderType[] = ['axonometric', 'floor_plan', 'section'];

function isValidRenderType(value: unknown): value is RenderType {
  return typeof value === 'string' && VALID_RENDER_TYPES.includes(value as RenderType);
}

export function createServer(): express.Application {
  const app = express();

  // Middleware
  app.use(express.json());

  // Serve static files from public directory
  app.use(express.static(join(__dirname, '../public')));

  // Health check endpoint
  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok' });
  });

  // POST /render endpoint
  app.post(
    '/render',
    upload.single('image'),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        // Validate image file
        if (!req.file) {
          res.status(400).json({
            error: 'No image file provided. Please upload an image using multipart/form-data with field name "image"',
          });
          return;
        }

        // Validate projectId
        const projectId = req.body.projectId;
        if (!projectId || typeof projectId !== 'string') {
          res.status(400).json({
            error: 'projectId is required and must be a string',
          });
          return;
        }

        // Validate renderType
        const renderType = req.body.renderType;
        if (!isValidRenderType(renderType)) {
          res.status(400).json({
            error: `renderType is required and must be one of: ${VALID_RENDER_TYPES.join(', ')}`,
          });
          return;
        }

        const sketchBuffer = req.file.buffer;
        const result = await generateConceptImage(sketchBuffer, renderType);

        res.json({
          imageBase64: result.imageBase64,
          model: result.model,
          promptVersion: result.promptVersion,
          renderType: result.renderType,
        });
      } catch (error) {
        next(error);
      }
    }
  );

  // Error handling middleware
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction): void => {
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

