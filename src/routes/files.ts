import { Router, Request, Response, RequestHandler } from "express";
import { ObjectId } from "mongodb";
import { authMiddleware } from '../middleware/auth';
import { upload, writeFile, readFile, deleteFile, findFiles } from '../utils/mongoose-gridfs';

interface GridFSFile {
  _id: ObjectId;
  length: number;
  chunkSize: number;
  uploadDate: Date;
  filename: string;
  contentType?: string;
  metadata?: any;
  aliases?: string[];
}

// Update interface with proper extension
interface AuthenticatedRequest extends Request {
  user?: {
    _id: ObjectId;
    [key: string]: any;
  };
  files?: Express.Multer.File[];
}

const router = Router();

// Public routes first
router.get("/:id", streamFileHandler);
router.get("/meta/:id", getFileMetadataHandler);
router.get("/data/:ids", getFileDataHandler);

// Apply auth middleware to all protected routes
router.use(authMiddleware);

// Protected routes below
router.post("/upload", ((req: AuthenticatedRequest, res: Response) => {
  // Cast req and res to any to bypass type conflicts between express and multer
  upload(req as any, res as any, async (err) => {
    if (err) {
      console.error("Multer error:", err);
      return res.status(400).json({ message: "File upload error", error: err.message });
    }

    try {
      if (!req.user?._id) {
        return res.status(401).json({ message: "Authentication required" });
      }

      if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
        return res.status(400).json({ message: "No files were uploaded" });
      }

      const uploadedFiles = await Promise.all(req.files.map(async (file) => {
        if (!file.originalname || !file.mimetype || !file.size) {
          throw new Error(`Invalid file information: ${JSON.stringify(file)}`);
        }
        
        const fileData = await writeFile(file.buffer, {
          filename: file.originalname,
          contentType: file.mimetype,
          metadata: {
            userID: req.user!._id,
            originalname: file.originalname,
            size: file.size,
            uploadDate: new Date()
          }
        }) as GridFSFile;

        return {
          _id: fileData._id,
          filename: fileData.metadata?.originalname || fileData.filename,
          originalname: file.originalname,
          size: file.size,
          mimetype: file.mimetype
        };
      }));

      res.json({ files: uploadedFiles });
    } catch (error: any) {
      console.error('Upload error:', error);
      res.status(500).json({ 
        message: "Error uploading files",
        error: error?.message || 'Unknown error occurred'
      });
    }
  });
}) as RequestHandler);

router.get("/list/:userID", (async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!ObjectId.isValid(req.params.userID)) {
      return res.status(400).json({ message: "Invalid userID" });
    }

    if (!req.user?._id || req.user._id.toString() !== req.params.userID) {
      return res.status(403).json({ message: "Unauthorized to access these files" });
    }

    const files = await findFiles({ "metadata.userID": new ObjectId(req.params.userID) });
    res.json(files || []);
  } catch (error) {
    console.error('List files error:', error);
    res.status(500).json({ message: "Error retrieving files", error });
  }
}) as RequestHandler);

router.delete("/:id", (async (req: AuthenticatedRequest, res: Response) => {
  if (!ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ message: "Invalid file ID" });
  }

  try {
    // Verify file ownership before deletion
    const files = await findFiles({ _id: new ObjectId(req.params.id) });
    if (!files || files.length === 0) {
      return res.status(404).json({ message: "File not found" });
    }

    const file = files[0];
    if (file.metadata?.userID.toString() !== req.user?._id.toString()) {
      return res.status(403).json({ message: "Unauthorized to delete this file" });
    }

    await deleteFile(req.params.id);
    res.json({ message: "File deleted successfully" });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ message: `An error occurred while deleting the file: ${err.message}` });
  }
}) as RequestHandler);

// Helper function to handle streaming files
async function streamFileHandler(req: Request, res: Response) {
  if (!ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ message: "Invalid file ID" });
  }

  try {
    console.log(`[Files] Public access request for file: ${req.params.id}`);
    const readStream = await readFile(req.params.id);
    if (!readStream) {
      console.warn(`[Files] File not found: ${req.params.id}`);
      return res.status(404).json({ message: "File not found" });
    }
    
    res.set({
      'Cache-Control': 'public, max-age=31536000',
      'Expires': new Date(Date.now() + 31536000000).toUTCString()
    });
    
    readStream.pipe(res);
  } catch (err: any) {
    console.error(`[Files] Error reading file ${req.params.id}:`, err);
    if (!res.headersSent) {
      res.status(500).json({ message: "Error retrieving file", error: err.message });
    }
  }
}

// Helper function to handle file metadata requests
async function getFileMetadataHandler(req: Request, res: Response) {
  if (!ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ message: "Invalid file ID" });
  }

  try {
    console.log(`[Files] Metadata request for file: ${req.params.id}`);
    const files = await findFiles({ _id: new ObjectId(req.params.id) });
    if (!files || files.length === 0) {
      console.warn(`[Files] File metadata not found: ${req.params.id}`);
      return res.status(404).json({ message: "File not found" });
    }

    const file = files[0];
    res.json({
      id: file._id,
      filename: file.metadata?.originalname || file.filename,
      contentType: file.contentType,
      size: file.length,
      uploadDate: file.uploadDate
    });
  } catch (err: any) {
    console.error(`[Files] Error getting file metadata ${req.params.id}:`, err);
    res.status(500).json({ 
      message: "Error retrieving file metadata",
      error: err.message 
    });
  }
}

// Helper function to handle file data requests
async function getFileDataHandler(req: Request, res: Response) {
  try {
    if (!req.params.ids) {
      return res.status(400).json({ message: "No file IDs provided" });
    }

    const rawIds = req.params.ids.split(",").filter(id => id.trim());
    if (rawIds.length === 0) {
      return res.status(400).json({ message: "No valid file IDs provided" });
    }

    const ids = [];
    const invalidIds = [];
    
    for (let id of rawIds) {
      if (ObjectId.isValid(id.trim())) {
        ids.push(new ObjectId(id.trim()));
      } else {
        invalidIds.push(id);
      }
    }

    if (invalidIds.length > 0) {
      return res.status(400).json({ 
        message: "Invalid file ID(s) provided", 
        invalidIds 
      });
    }

    const files = await findFiles({ _id: { $in: ids } });

    if (!files || files.length === 0) {
      return res.status(404).json({ message: "No files found" });
    }

    if (files.length !== ids.length) {
      const foundIds = files.map(file => file._id.toString());
      const missingIds = ids.map(id => id.toString()).filter(id => !foundIds.includes(id));
      return res.status(404).json({ 
        message: "Some files were not found",
        missingIds
      });
    }

    const fileData = files.map((file: GridFSFile) => ({
      id: file._id,
      filename: file.metadata?.originalname || file.filename,
      contentType: file.contentType || 'application/octet-stream',
      length: file.length,
      uploadDate: file.uploadDate,
      metadata: file.metadata || {},
    }));

    res.json(fileData);
  } catch (err: any) {
    console.error('Error in /files/data/:ids:', err);
    res.status(500).json({ 
      message: "Error retrieving files",
      error: err.message 
    });
  }
}

export default router;
