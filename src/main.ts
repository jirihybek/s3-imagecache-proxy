/**
 * @package s3-imagecache-proxy
 * @author Jiri Hybek <jiri@hybek.cz>
 * @license Apache-2.0 See the LICENSE file for details.
 */

import express from "express";
import { default as logger, LOG_LEVEL_NAME_MAP, parseLogLevel } from "meta2-logger";
import { cleanEnv, str, num, bool } from "envalid"
import { S3Client, GetObjectCommand, _Error } from "@aws-sdk/client-s3";
import { Readable } from "stream";
import sharp from "sharp";

import { FileCacheStore } from "./FileCacheStore";
import { generateSignature, getMimeTypeFromImageFormat, imageOptionsToLabels, parseOptions, readFileOptions, readImageOptions } from "./Util";
import { TFileOptions, TImageOptions, TParsedRequest } from "./Types";

function getNullableEnv(value: string): string|undefined {
    return value === "[none]" ? undefined : value;
}

// Read configuration
const config = cleanEnv(process.env, {
    LOG_LEVEL: str({
        choices: Object.keys(LOG_LEVEL_NAME_MAP),
        default: "info"
    }),
    PORT: num({ default: 3000 }),
    CACHE_DIR: str({ default: "./data/cache" }),
    AWS_ACCESS_KEY_ID: str(),
    AWS_SECRET_ACCESS_KEY: str(),
    AWS_REGION: str({ default: "localhost" }),
    AWS_ENDPOINT: str({ default: "[none]" }),
    AWS_FORCE_PATH_STYLE: bool({ default: false }),
    AWS_S3_BUCKET: str(),
    URL_SIGNATURE_KEY: str()
});

console.log("Initializing service with configuration:", {
    logLevel: config.LOG_LEVEL,
    port: config.PORT,
    cacheDir: config.CACHE_DIR,
    aws: {
        credentials: {
            accessKeyId: config.AWS_ACCESS_KEY_ID,
            secretAccessKey: "[redacted]"
        },
        region: config.AWS_REGION,
        endpoint: config.AWS_ENDPOINT,
        bucket: config.AWS_S3_BUCKET,
        forcePathStyle: config.AWS_FORCE_PATH_STYLE
    },
    urlSignatureKey: "[redacted]"
});

// Configure logger
logger.toConsole({
    level: parseLogLevel(config.LOG_LEVEL),
    timestamp: true,
    colorize: true
});

// Create services
const cacheStore = new FileCacheStore(logger.facility("cache-store"), {
    cacheDir: config.CACHE_DIR
});

const s3Client = new S3Client({
    credentials: {
        accessKeyId: config.AWS_ACCESS_KEY_ID,
        secretAccessKey: config.AWS_SECRET_ACCESS_KEY
    },
    region: config.AWS_REGION,
    endpoint: getNullableEnv(config.AWS_ENDPOINT),
    forcePathStyle: config.AWS_FORCE_PATH_STYLE
});

// Middleware to check signature and parse options
function parseMiddleware<TOpts>(opType: string, readOptionsFn: (opts: Record<string, string>) => TOpts) {
    return ((req: TParsedRequest<TOpts>, res: express.Response, next: express.NextFunction) => {
        const reqOptions = parseOptions(req.params["options"]);
        const objectPath = req.params["objectPath"];
        const signature = req.params["signature"];

        logger.debug(`${opType} request for ${objectPath} with options:`, reqOptions);
        
        // Verify signature
        const [ signatureType, signatureValue ] = signature.split(":");

        switch(signatureType) {
            case "shm": {
                const sigVerify = generateSignature(config.URL_SIGNATURE_KEY, req.params["options"], objectPath);
    
                if (sigVerify !== signatureValue) {
                    logger.debug("Invalid signature, expected '%s', got '%s'", sigVerify, signatureValue);
                    res.status(403).send("Invalid signature");
                    return;
                }

                break;
            }
            default: {
                logger.debug("Invalid signature type '%s'", signatureType);
                res.status(400).send("Invalid signature type");
                return;
            }
        }

        // Try to read options
        try {
            req.objectPath = objectPath;
            req.options = readOptionsFn(reqOptions);
        } catch (e) {
            res.status(400).send("Invalid options: " + String(e));
            return;
        }

        next();
    }) as express.RequestHandler;
}

// Create express app
const app = express();

app.get("/file/:signature/:options/:objectPath(*)", parseMiddleware("File", readFileOptions), async (req, res) => {
    const { options, objectPath } = req as TParsedRequest<TFileOptions>;

    // Try to get object from cache
    if (!options.noCache) {
        const etag = req.headers["if-none-match"] ?? "";
        const cacheResult = await cacheStore.getObject(objectPath, [], etag);
    
        if (cacheResult) {
            // Write file to response
            if (cacheResult.stream) {
                logger.debug("Object '%s' found in cache, returning it.", objectPath);
    
                res.status(200);
    
                if (options.mimeType) {
                    res.header("Content-Type", options.mimeType);
                }
    
                res.header("ETag", cacheResult.etag);
                cacheResult.stream.pipe(res);
            } else {
                logger.debug("Object '%s' found in cache, etag matches.", objectPath);
    
                res.status(304).send("Not modified");
                res.end();
            }
    
            return;
        }
    }

    // Get the file from S3
    try {
        const s3Object = await s3Client.send(new GetObjectCommand({
            Bucket: config.AWS_S3_BUCKET,
            Key: objectPath
        }));

        const s3Stream = s3Object.Body! as Readable;

        // Put objec to cache and return it to client
        cacheStore.putObject(objectPath, [], s3Stream);

        res.status(200);

        if (options.mimeType) {
            res.header("Content-Type", options.mimeType);
        }

        s3Stream.pipe(res);
    } catch (e) {
        if ((e as _Error)?.Code === "NoSuchKey") {
            logger.debug("Object '%s' not found in S3", objectPath);
            res.status(404).send("Not found");
            return;
        }

        logger.warn("Error while getting object from S3:", e);
        res.status(500).send("Internal server error");
    }
});

app.get("/image/:signature/:options/:objectPath(*)", parseMiddleware("Image", readImageOptions), async (req, res) => {
    const { options, objectPath } = req as TParsedRequest<TImageOptions>;
    const mimeType = getMimeTypeFromImageFormat(options.format);

    // Try to get object from cache
    const etag = req.headers["if-none-match"] ?? "";
    const cacheLabels = imageOptionsToLabels(options);
    const cacheResult = await cacheStore.getObject(objectPath, cacheLabels, etag);

    if (cacheResult) {
        if (cacheResult.stream) {
            // Write file to response
            logger.debug("Object '%s' found in cache, returning it.", objectPath);

            res.status(200);
            res.header("Content-Type", mimeType);

            res.header("ETag", cacheResult.etag);
            cacheResult.stream.pipe(res);
        } else {
            // Return not modified
            logger.debug("Object '%s' found in cache, etag matches.", objectPath);

            res.status(304).send("Not modified");
            res.end();
        }

        return;
    }

    // Not found in cache, try to get it from S3
    try {
        const s3Object = await s3Client.send(new GetObjectCommand({
            Bucket: config.AWS_S3_BUCKET,
            Key: objectPath
        }));

        const data = await s3Object.Body?.transformToByteArray();
        
        if (!data) {
            throw new Error("No data in S3 object");
        }

        // Transform image as requesred
        let image = sharp(data);

        if (options.width || options.height) {
            image = image.resize(options.width, options.height, {
                fit: options.fit,
                kernel: sharp.kernel.mitchell,
                background: { r:0, g:0, b:0, alpha: 0.0 },
                position: sharp.gravity.center
            });
        }

        switch(options.format) {
            case "jpeg":
                image = image.jpeg();
                break;
            case "png":
                image = image.png();
                break;
            case "webp":
                image = image.webp();
                break;
        }

        const imageData = await image.toBuffer();

        // Put object to cache and return it to client
        cacheStore.putObject(objectPath, cacheLabels, imageData);

        // Write image to response
        res.status(200);
        res.header("Content-Type", mimeType);
        res.end(imageData);
    } catch (e) {
        if ((e as _Error)?.Code === "NoSuchKey") {
            logger.debug("Object '%s' not found in S3", objectPath);
            res.status(404).send("Not found");
            return;
        }

        logger.warn("Error while getting image:", e);
        res.status(500).send("Internal server error");
    }
});

// Start server
app.listen(config.PORT, () => {
    logger.info("Server started and listening on port %d", config.PORT)
});