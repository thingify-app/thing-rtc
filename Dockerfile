FROM node:12-alpine as BUILD_IMAGE

# The node image includes a user `node` which both avoids us running as root,
# and also prevents issues with `npm install` downgrading itself which leads to
# build issues.
RUN mkdir /app && chown -R node:node /app
WORKDIR /app
COPY --chown=node:node . .

WORKDIR /app/example

USER node
RUN npm install

# Remove dev dependencies from node_modules.
RUN npm prune --production

# Multi-stage Dockerfile, i.e. the intermediate steps from the above build
# section do not get included in our final image. We only copy across the
# relevant final build artifacts, which avoids us including the dev node_modules
# dependencies.
FROM node:12-alpine

WORKDIR /app
COPY --from=BUILD_IMAGE /app .

WORKDIR /app/example

EXPOSE 8080
CMD [ "node", "server.js" ]
