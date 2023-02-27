# s3-imagecache-proxy

Microservice that acts as a proxy to AWS S3 storage with caching and on-the-fly image resizing capabilities. Based on the [sharp](https://sharp.pixelplumbing.com/) library.

**Motivation:**  
When developing internal software services you often need to resize images and provide secure access to static files - eg. internal documents, uploaded images, etc.

## Features

- Simple file proxy using signed URL without time expiration (S3 does not support secured access without expiration).
- Image proxy that supports resizing.
- Optional caching to provide speed (mostly with resized images).

## Usage

The service exposes the following endpoints:

- `GET /file/:signature/:options/:objectPath(*)` - returns raw file with (optional) caching.
- `GET /image/:signature/:options/:objectPath(*)` - returns a resized and converted image with caching.

### Signature

In all cases, you must provide the `signature` parameter in the URL. The signature is composed from the type and value separated by `:`.

Currently, only the `shm` type is supported.

The `shm` signature is computed as the SHA256 HMAC signed string that combines options and the objectPath.

The HMAC key is specified in the service configuration.

**Example in pseudocode:**

```
# Desired URL
GET /image/:signature/jpeg+w:300+h:300+cover/my/image.png

options="jpeg+w:300+h:300+cover"
objectPath="/my/image.png"
key="test"
signature="shm:" + sha256_hmac_hex(<key>, options+objectPath)

> signature="shm:" + sha256_hmac_hex("test", "jpeg+w:300+h:300+cover/my/image.png")
> "shm:07bd3fedfa67453b0ba4da36613017f061f2b9fd63e2a9733cc66043ea742283"

# Final URL
GET /image/shm:07bd3fedfa67453b0ba4da36613017f061f2b9fd63e2a9733cc66043ea742283/jpeg+w:300+h:300+cover/my/image.png
```

**Example in Node.js:**

```javascript
const options = "jpeg+w:300+h:300+cover";
const objectPath = "/my/image.png";
const key = "test";

const hmac = createHmac("sha256", key);
hmac.update(options + objectPath);
return "hms:" + hmac.digest("hex");
```

### Options

Options are key-value pairs delimited by `:` and separated by `+` sign. Supported options are described below. Some options do not specify value.

**Example:**

```
key1:value1+key2:value2+key3+key4
```

### Endpoint to get raw file

`GET /file/:signature/:options/:objectPath(*)`

**Options:**

- `raw` - Raw format option - required.
- `m:<string>` - Specify mime-type returned in the HTTP header. Optional.
- `nc` - No cache - do not cache the file, always get it from S3. Optional.

**Examples:**

```
GET /file/:signature/raw/my/dir/file.txt
GET /file/:signature/raw+nc/my/dir/notCachedFile.bin
GET /file/:signature/raw+m:application%2Fpdf/my/dir/file
```

### Endpoint to get resized image

`GET /image/:signature/:options/:objectPath(*)`

**Format options - required:**

- `raw` - (default) Raw format - keep the original image format.
- `jpeg` - Return image in JPEG format.
- `png` - Return image in PNG format.
- `webp` - Return image in WebP format.

**Fit options:**

- `cover` - (default) Preserving aspect ratio, ensure the image covers both provided dimensions by cropping/clipping to fit.
- `contain` - Preserving aspect ratio, contain within both provided dimensions using "letterboxing" where necessary.
- `fill` - Ignore the aspect ratio of the input and stretch to both provided dimensions.
- `inside` - Preserving aspect ratio, resize the image to be as large as possible while ensuring its dimensions are less than or equal to both those specified.
- `outside` - Preserving aspect ratio, resize the image to be as small as possible while ensuring its dimensions are greater than or equal to both those specified.

**Position options:**

- `top` - Top center.
- `right-top` - Right top.
- `right` - Right center.
- `right-bottom` - Right bottom.
- `bottom` - Bottom center.
- `left-bottom` - Left bottom.
- `left` - Left center.
- `left-top` - Left top.
- `center` - (default) Center.
- `entropy` - Focus on the region with the highest [Shannon entropy](https://en.wikipedia.org/wiki/Entropy_%28information_theory%29).
- `attention` - Focus on the region with the highest luminance frequency, colour saturation and presence of skin tones.

**Dimension options:**

- `w:<number>` - Image width in pixels.
- `h:<number>` - Image height in pixels.

**Examples:**

```
GET /image/:signature/jpeg+w:400+h:300+cover+top/my/full/image.png
GET /image/:signature/raw+w:400+h:300/my/full/image.png
GET /image/:signature/jpeg+w:64+h:64+attention/user/john.doe/avatar.png
```

## Installation

```bash
npm install
npm run build
```

## Configuraton

The service is configured using the following environment variables:

```bash
LOG_LEVEL=debug|info|notice|warning|error
PORT=3000
CACHE_DIR=./data/cache
URL_SIGNATURE_KEY="<your_hmac_key>"
AWS_ACCESS_KEY_ID="<access_key>"
AWS_SECRET_ACCESS_KEY="<secret_key>"
AWS_REGION="us-west-1"
AWS_ENDPOINT="minio"
# Enable this when using with Minio
AWS_FORCE_PATH_STYLE=true
AWS_S3_BUCKET="test"
```

## Running the service

```bash
# Set env vars and run
npm run start
```

## Development

To run locally while loading config from an env file:

```bash
export $(cat ./dev.env | xargs) && npm run start
```

## Deployment using Docker

Seet `Dockerfile` and `deployment/docker-compose.yaml` files.

If you are using sample docker-compose file with Minio enabled, you have to log in to Minio Console and create credentials and bucket first.

```bash
# Build container
docker build -t s3-imagecache-proxy:latest .

# Create config env file
cat << EOF > ./config.env
LOG_LEVEL=info
PORT=3000
CACHE_DIR=/cache
URL_SIGNATURE_KEY="<your_hmac_key>"
AWS_ACCESS_KEY_ID="<access_key>"
AWS_SECRET_ACCESS_KEY="<secret_key>"
AWS_ENDPOINT="minio"
AWS_FORCE_PATH_STYLE=true
AWS_S3_BUCKET="test"
EOF

# Run the container
docker run \
    --env-file config.env \
    -v "./cache:/cache" \
    -p "3000:3000"
    s3-imagecache-proxy:latest
```

## License Apache 2.0

Copyright 2023 Jiri Hybek \<jiri(at)hybek.cz>

Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at

[http://www.apache.org/licenses/LICENSE-2.0](http://www.apache.org/licenses/LICENSE-2.0)

Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.