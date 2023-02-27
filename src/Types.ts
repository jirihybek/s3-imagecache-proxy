/**
 * @package s3-imagecache-proxy
 * @author Jiri Hybek <jiri@hybek.cz>
 * @license Apache-2.0 See the LICENSE file for details.
 */

import { Request } from "express";
import { ReadStream } from "fs";

/**
 * Result of the cache store get operation
 */
export interface TCacheResult {
    etag: string;
    stream?: ReadStream;
}

/**
 * File options
 */
export interface TFileOptions {
    noCache?: boolean;
    mimeType?: string;
}

/**
 * Image formats
 */
export type TImageFormat = "jpeg" | "png" | "webp" | "raw";

/**
 * Image options
 */
export interface TImageOptions {
    width?: number;
    height?: number;
    fit: "cover" | "contain" | "fill" | "inside" | "outside";
    position: "top" | "right top" | "right" | "right bottom" | "bottom" | "left bottom" | "left" | "left top" | "center" | "entropy" | "attention";
    format: TImageFormat;
}

/**
 * Parsed express request
 */
export interface TParsedRequest<TOpts> extends Request {
    objectPath: string;
    options: TOpts;
}
