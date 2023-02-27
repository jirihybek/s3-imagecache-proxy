/**
 * @package s3-imagecache-proxy
 * @author Jiri Hybek <jiri@hybek.cz>
 * @license Apache-2.0 See the LICENSE file for details.
 */

import { createHmac } from "crypto";
import { TFileOptions, TImageFormat, TImageOptions } from "./Types";

const fitMap = {
    "cover": "cover",
    "contain": "contain",
    "fill": "fill",
    "inside": "inside",
    "outside": "outside"
};

const positionMap = {
    "top": "top",
    "right-top": "right top",
    "right": "right",
    "right-bottom": "right bottom",
    "bottom": "bottom",
    "left-bottom": "left bottom",
    "left": "left",
    "left-top": "left top",
    "center": "center",
    "entropy": "entropy",
    "attention": "attention"
}

const formatMap = {
    "jpeg": "jpeg",
    "png": "png",
    "webp": "webp",
    "raw": "raw"
}

/**
 * Parses options from the given string in a format of option1:value,option2=value2
 * @param options 
 */
export function parseOptions(options: string): Record<string, string> {
    const res: Record<string, string> = {};

    options.split("+").forEach((opt) => {
        const [key, value] = opt.split(":");
        res[key] = value ?? "true";
    });

    return res;
}

/**
 * Function that generates signature for the given options and object path
 * It uses SHA256 HMAC hash algorithm to generate the signature by concatenating key, options and object path.
 * @param key 
 * @param options 
 */
export function generateSignature(key: string, options: string, objectPath: string): string {
    const hmac = createHmac("sha256", key);
    hmac.update(options + "/" + objectPath);
    return hmac.digest("hex");

}

/**
 * Parses request options into file options
 *
 * @param options Request options
 * @returns File options
 */
export function readFileOptions(options: Record<string, string>): TFileOptions {
    const res: TFileOptions = {};

    // No cache
    if (options["nc"]) {
        res.noCache = true;
    }

    // Mime type
    if (options["m"]) {
        res.mimeType = options["m"];
    }

    return res;
}

/**
 * Parses request options into image options
 *
 * @param options Request options
 * @returns Image options
 */
export function readImageOptions(options: Record<string, string>): TImageOptions {
    const res: TImageOptions = {
        format: "raw",
        fit: "cover",
        position: "center"
    };

    // Width
    if (options["w"]) {
        res.width = parseInt(options["w"]);

        if (isNaN(res.width)) {
            throw new Error("Invalid width value");
        }
    }

    // Height
    if (options["h"]) {
        res.height = parseInt(options["h"]);
        
        if (isNaN(res.height)) {
            throw new Error("Invalid height value");
        }
    }

    // Fit
    for (const k in fitMap) {
        if (options[k]) {
            res.fit = fitMap[k as keyof typeof fitMap] as TImageOptions["fit"];
        }
    }

    // Position
    for (const k in positionMap) {
        if (options[k]) {
            res.position = positionMap[k as keyof typeof positionMap] as TImageOptions["position"];
        }
    }

    // Format
    for (const k in formatMap) {
        if (options[k]) {
            res.format = formatMap[k as keyof typeof formatMap] as TImageOptions["format"];
        }
    }

    return res;
}

/**
 * Converts image options to labels
 * @param options Image options
 * @returns Labels
 */
export function imageOptionsToLabels(options: TImageOptions): string[] {
    const res: string[] = [];

    if (options.width) {
        res.push(`w_${options.width}`);
    }

    if (options.height) {
        res.push(`h_${options.height}`);
    }

    if (options.fit) {
        res.push(`f_${options.fit}`);
    }

    if (options.format) {
        res.push(`f_${options.format}`);
    }

    return res;
}

/**
 * Returns mime type for the given image format
 *
 * @param format Image format
 * @returns Mime type
 */
export function getMimeTypeFromImageFormat(format: TImageFormat): string|undefined {
    switch (format) {
        case "jpeg":
            return "image/jpeg";
        case "png":
            return "image/png";
        case "webp":
            return "image/webp";
        default:
            return undefined;
    }
}