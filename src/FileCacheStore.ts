/**
 * @package s3-imagecache-proxy
 * @author Jiri Hybek <jiri@hybek.cz>
 * @license Apache-2.0 See the LICENSE file for details.
 */

import { LoggerFacility } from "meta2-logger";
import { stat } from "fs/promises";
import { createReadStream, createWriteStream, rename, writeFile } from "fs";
import { v4 as uuid_v4 } from "uuid";
import { Readable } from "stream";
import { TCacheResult } from "./Types";

/**
 * File cache store options
 */
export interface TFileCacheStoreOptions {
    cacheDir: string;
}

/**
 * Class that handles caching files to the local filesystem
 */
export class FileCacheStore {
    public constructor(private logger: LoggerFacility,  private options: TFileCacheStoreOptions) {}

    /**
     * Returns cached object with stream or null if not found
     * If etag matches, the cache result object is returned but without stream.
     *
     * @param key Object key
     * @param labels Labels
     * @param etag Etag
     * @returns Cache result
     */
    public async getObject(key: string, labels: string[], etag: string): Promise<TCacheResult|null> {
        const filename = this.getFilename(key, labels);
        let computedEtag: string;

        // Stat file, get last modified time
        try {
            const fileInfo = await stat(filename);
            computedEtag = "mt_" + fileInfo.mtime.getTime();

            // Check if etag matches, if so, return early
            if (computedEtag === etag) {
                return {
                    etag: etag,
                    stream: undefined
                };
            }
        } catch (err) {
            // File not found, return null
            return null;
        }

        // Return stream
        return {
            etag: computedEtag,
            stream: createReadStream(filename)
        };
    }

    /**
     * Write cache entry from the writable stream
     *
     * @param key Object key
     * @param labels Labels
     * @param data Stream object
     */
    public putObject(key: string, labels: string[], data: Readable|Buffer): void {
        const filename = this.getFilename(key, labels);
        const tmpFilename = this.getFilename("tmp_" + uuid_v4(), []);

        // Write to temp first, then move the file to avoid concurrent read/writes
        const finalize = () => {
            // Move file
            rename(tmpFilename, filename, (err) => {
                if (err) {
                    this.logger.warn("Failed to move cache file", { key, tmpFilename, filename, err });
                    return;
                }
            });
        };

        if (data instanceof Buffer) {
            writeFile(tmpFilename, data, (err) => {
                if (err) {
                    this.logger.warn("Failed to write cache file", { key, tmpFilename, err });
                    return;
                }

                this.logger.debug("Cache file written to temp file", { key, tmpFilename });
                finalize();
            });
        } else {
            const ws = createWriteStream(tmpFilename, { autoClose: true });
            data.pipe(ws);
    
            ws.on("finish", () => {
                this.logger.debug("Cache file written to temp file", { key, tmpFilename });
                finalize();
            });
        }
    }

    /**
     * Return filename of the cache object in the cache directory
     * @param key Object key
     * @param labels Labels
     * @returns 
     */
    private getFilename(key: string, labels: string[]): string {
        return this.options.cacheDir
            + "/" + encodeURIComponent(key)
            + (labels.length ? "_" + encodeURIComponent(labels.join("_")) : "");
    }
}