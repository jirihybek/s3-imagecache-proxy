### Build ###
FROM node:18-alpine AS build
WORKDIR /app

# Install dependencies
ADD ./package.json /app/package.json
ADD ./package-lock.json /app/package-lock.json
RUN npm install

# Build the app
ADD ./src /app/src
ADD ./tsconfig.json /app/tsconfig.json
ADD ./tsconfig.app.json /app/tsconfig.app.json
ADD ./tsconfig.spec.json /app/tsconfig.spec.json
RUN npm run build

### Runtime ###
FROM node:18-alpine AS runtime

LABEL S3 Image-Cache Proxy
LABEL Vendor Jiri Hybek
LABEL Version 1.0

WORKDIR /app

# Copy build artifacts
COPY --from=build /app/dist /app/dist
COPY --from=build /app/package.json /app/package.json
COPY --from=build /app/package-lock.json /app/package-lock.json

# Install production dependencies
RUN npm install --only=production

# Entrypoint
ENTRYPOINT ["npm", "run", "start"]